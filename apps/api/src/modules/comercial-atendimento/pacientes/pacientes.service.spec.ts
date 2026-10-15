import { CONSULTA_LOOKUP, txHostFalso } from '../../../../test/utils/tx-host-falso';
import { mascararCpf, PacientesService } from './pacientes.service';

const PACIENTE = {
  id: '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  nome: 'Maria Teste',
  documento: '12345678901',
  ativo: true,
};

function setup(registros = [PACIENTE]) {
  const { txHost, delegate } = txHostFalso('paciente', registros);
  return { service: new PacientesService(txHost), delegate };
}

describe('PacientesService', () => {
  it('lookup: só ativos, busca por nome ou pelos dígitos do CPF, CPF mascarado', async () => {
    const { service, delegate } = setup();

    const page = await service.lookup({ ...CONSULTA_LOOKUP, search: '345.678' });

    expect(delegate.count).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        ativo: true,
        OR: [
          { nome: { contains: '345.678', mode: 'insensitive' } },
          { documento: { contains: '345678' } },
        ],
      },
    });
    expect(page.data).toEqual([
      { id: PACIENTE.id, label: 'Maria Teste', descricao: '***.456.789-**' },
    ]);
  });

  it('busca sem dígitos procura só no nome; sem busca não filtra texto', async () => {
    const { service, delegate } = setup();

    await service.lookup({ ...CONSULTA_LOOKUP, search: 'maria' });
    await service.lookup(CONSULTA_LOOKUP);

    expect(delegate.count.mock.calls[0][0].where.OR).toEqual([
      { nome: { contains: 'maria', mode: 'insensitive' } },
    ]);
    expect(delegate.count.mock.calls[1][0].where).toEqual({ deletedAt: null, ativo: true });
  });

  it('findLookupById e 404', async () => {
    await expect(setup().service.findLookupById(PACIENTE.id)).resolves.toMatchObject({
      label: 'Maria Teste',
    });
    await expect(setup([]).service.findById(PACIENTE.id)).rejects.toMatchObject({
      message: 'Paciente não encontrado',
    });
  });

  it('mascararCpf só para CPF com 11 dígitos', () => {
    expect(mascararCpf('98765432100')).toBe('***.654.321-**');
    expect(mascararCpf('11222333000181')).toBeNull();
    expect(mascararCpf(null)).toBeNull();
  });
});
