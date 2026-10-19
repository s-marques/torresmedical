import { CONSULTA_LOOKUP, txHostFalso } from '../../../../test/utils/tx-host-falso';
import { ProfissionaisService } from './profissionais.service';

const ESPECIALIDADE_ID = '7a1d3c52-8d0f-4b8e-9f4c-2b2f3c4d5e6f';
const PROFISSIONAL = {
  id: '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  nome: 'Dra. Teste',
  registro: 'CRM 1234',
  especialidade: { nome: 'Pediatria' },
};

function setup(registros = [PROFISSIONAL]) {
  const { txHost, delegate } = txHostFalso('profissional', registros);
  return { service: new ProfissionaisService(txHost), delegate };
}

describe('ProfissionaisService', () => {
  it('lookup: ativos, filtro por especialidade, busca em nome e registro, com a especialidade', async () => {
    const { service, delegate } = setup();

    const page = await service.lookup({
      ...CONSULTA_LOOKUP,
      search: 'crm',
      especialidadeId: ESPECIALIDADE_ID,
    });

    expect(delegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { especialidade: { select: { nome: true } } },
        where: {
          deletedAt: null,
          ativo: true,
          especialidadeId: ESPECIALIDADE_ID,
          OR: [
            { nome: { contains: 'crm', mode: 'insensitive' } },
            { registro: { contains: 'crm', mode: 'insensitive' } },
          ],
        },
      }),
    );
    expect(page.data[0]).toEqual({
      id: PROFISSIONAL.id,
      label: 'Dra. Teste',
      descricao: 'Pediatria · CRM 1234',
    });
  });

  it('findLookupById inclui a especialidade; sem especialidade e registro a descrição é nula', async () => {
    const { service, delegate } = setup([
      { ...PROFISSIONAL, registro: null, especialidade: null } as never,
    ]);

    await expect(service.findLookupById(PROFISSIONAL.id)).resolves.toMatchObject({
      descricao: null,
    });
    expect(delegate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ include: { especialidade: { select: { nome: true } } } }),
    );
    await expect(setup([]).service.findById(PROFISSIONAL.id)).rejects.toMatchObject({
      message: 'Profissional não encontrado',
    });
  });

  it('contarAtivos: só profissionais ativos e não excluídos', async () => {
    const { service, delegate } = setup();

    await expect(service.contarAtivos()).resolves.toBe(1);

    expect(delegate.count).toHaveBeenCalledWith({ where: { deletedAt: null, ativo: true } });
  });
});
