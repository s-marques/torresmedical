import { CONSULTA_LOOKUP, txHostFalso } from '../../../../test/utils/tx-host-falso';
import type { ExportService } from '../../../common/export/export.service';
import {
  formatarDocumento,
  mascararCpf,
  PacientesService,
  toPacienteDto,
} from './pacientes.service';

const PACIENTE = {
  id: '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  nome: 'Maria Teste',
  documento: '12345678901',
  status: 'ATIVO',
};

function setup(registros = [PACIENTE]) {
  const { txHost, delegate } = txHostFalso('paciente', registros);
  return { service: new PacientesService(txHost, {} as ExportService), delegate };
}

describe('PacientesService', () => {
  it('lookup: só ativos, busca por nome ou pelos dígitos do CPF, CPF mascarado', async () => {
    const { service, delegate } = setup();

    const page = await service.lookup({ ...CONSULTA_LOOKUP, search: '345.678' });

    expect(delegate.count).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        status: { not: 'INATIVO' },
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
    expect(delegate.count.mock.calls[1][0].where).toEqual({
      deletedAt: null,
      status: { not: 'INATIVO' },
    });
  });

  it('contar: total de pacientes não excluídos, ativos ou não', async () => {
    const { service, delegate } = setup();

    await service.contar();

    expect(delegate.count).toHaveBeenCalledWith({ where: { deletedAt: null } });
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

  it('formatarDocumento: CPF, CNPJ e valores fora do padrão', () => {
    expect(formatarDocumento('52998224725')).toBe('529.982.247-25');
    expect(formatarDocumento('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatarDocumento('123')).toBe('123');
    expect(formatarDocumento(null)).toBeNull();
  });

  it('toPacienteDto: data só com dia, nome da origem e sem deletedAt', () => {
    const agora = new Date('2026-10-20T12:00:00.000Z');
    const dto = toPacienteDto({
      ...PACIENTE,
      dataNascimento: new Date('1990-05-17T00:00:00.000Z'),
      origemCliente: { nome: 'Google' },
      createdAt: agora,
      updatedAt: agora,
      deletedAt: null,
    } as never);

    expect(dto).toMatchObject({
      dataNascimento: '1990-05-17',
      origemNome: 'Google',
      createdAt: agora.toISOString(),
    });
    expect(dto).not.toHaveProperty('deletedAt');
    expect(dto).not.toHaveProperty('origemCliente');
  });

  it('list: ordena a origem pelo nome dela e o telefone pelo celular', async () => {
    const agora = new Date();
    const { service, delegate } = setup([
      { ...PACIENTE, createdAt: agora, updatedAt: agora, origemCliente: null } as never,
    ]);
    const consulta = { page: 1, pageSize: 10, search: undefined, status: undefined };

    await service.list({ ...consulta, sort: { field: 'origem', direction: 'desc' } });
    await service.list({ ...consulta, sort: { field: 'telefone', direction: 'asc' } });

    expect(delegate.findMany.mock.calls[0][0].orderBy).toEqual([
      { origemCliente: { nome: 'desc' } },
      { id: 'desc' },
    ]);
    expect(delegate.findMany.mock.calls[1][0].orderBy).toEqual([{ celular: 'asc' }, { id: 'asc' }]);
  });
});
