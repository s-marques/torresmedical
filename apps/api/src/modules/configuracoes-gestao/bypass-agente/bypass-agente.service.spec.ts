import { txHostFalso } from '../../../../test/utils/tx-host-falso';
import { BypassAgenteService } from './bypass-agente.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const REGISTRO = { id: ID, telefone: '5565999990000', nome: null, cargo: null, ativo: true };
const ENTRADA = { telefone: '5565999990000', nome: null, cargo: null };

function servico(findFirst: unknown[] = [REGISTRO]) {
  const fake = txHostFalso('bypassAgente', [REGISTRO]);
  for (const valor of findFirst) fake.delegate.findFirst.mockResolvedValueOnce(valor);
  fake.delegate.findFirst.mockResolvedValue(null);
  return { service: new BypassAgenteService(fake.txHost), delegate: fake.delegate };
}

describe('BypassAgenteService', () => {
  it('list: sem excluídos, busca em nome, telefone e cargo e filtra o status', async () => {
    const { service, delegate } = servico();

    await service.list({
      page: 1,
      pageSize: 10,
      sort: { field: 'nome', direction: 'asc' },
      search: 'ana',
      status: 'ativo',
    });

    const contem = { contains: 'ana', mode: 'insensitive' };
    expect(delegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          ativo: true,
          OR: [{ nome: contem }, { telefone: contem }, { cargo: contem }],
        },
        orderBy: [{ nome: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('create: grava quando o telefone está livre', async () => {
    const { service, delegate } = servico([null]);
    delegate.create.mockResolvedValue(REGISTRO);
    await service.create(ENTRADA);
    expect(delegate.create).toHaveBeenCalledWith({ data: ENTRADA });
  });

  it('create: 409 DUPLICATE quando o telefone já está na lista', async () => {
    const { service, delegate } = servico([{ id: 'outro' }]);
    await expect(service.create(ENTRADA)).rejects.toMatchObject({
      code: 'DUPLICATE',
      status: 409,
    });
    expect(delegate.create).not.toHaveBeenCalled();
  });

  it('update: ignora o próprio registro na checagem de duplicidade', async () => {
    const { service, delegate } = servico([REGISTRO, null]);
    delegate.update.mockResolvedValue(REGISTRO);
    await service.update(ID, ENTRADA);
    expect(delegate.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { telefone: ENTRADA.telefone, deletedAt: null, id: { not: ID } },
      }),
    );
    expect(delegate.update).toHaveBeenCalledWith({ where: { id: ID }, data: ENTRADA });
  });

  it('alterarStatus e remove: 404 quando não existe e exclusão lógica quando existe', async () => {
    const vazio = servico([null]);
    await expect(vazio.service.alterarStatus(ID, false)).rejects.toMatchObject({ status: 404 });

    const { service, delegate } = servico([REGISTRO, REGISTRO]);
    delegate.update.mockResolvedValue(REGISTRO);
    await service.alterarStatus(ID, false);
    expect(delegate.update).toHaveBeenCalledWith({ where: { id: ID }, data: { ativo: false } });
    await service.remove(ID);
    expect(delegate.update).toHaveBeenLastCalledWith({
      where: { id: ID },
      data: { deletedAt: expect.any(Date) },
    });
  });
});
