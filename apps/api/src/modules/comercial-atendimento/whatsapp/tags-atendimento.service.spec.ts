import { BusinessException } from '../../../common/errors/api.exception';
import { txHostFalso } from '../../../../test/utils/tx-host-falso';
import { TagsAtendimentoService } from './tags-atendimento.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const TAG = {
  id: ID,
  nome: 'Retorno',
  cor: '#3b82f6',
  createdAt: new Date('2026-10-14T12:00:00.000Z'),
  updatedAt: new Date('2026-10-14T12:00:00.000Z'),
  deletedAt: null,
};

function setup(registros = [TAG]) {
  const { txHost, delegate } = txHostFalso('tagAtendimento', registros);
  return { service: new TagsAtendimentoService(txHost), delegate };
}

describe('TagsAtendimentoService', () => {
  it('list: só as não excluídas, na ordem pedida', async () => {
    const { service, delegate } = setup();

    const page = await service.list({
      page: 1,
      pageSize: 10,
      sort: { field: 'nome', direction: 'asc' },
      search: undefined,
    });

    expect(delegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null }, skip: 0, take: 10 }),
    );
    expect(page.data).toEqual([TAG]);
  });

  describe('create', () => {
    it('cria quando o nome está livre', async () => {
      const { service, delegate } = setup([]);

      await service.create({ nome: 'VIP', cor: '#000000' });

      expect(delegate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null, nome: { equals: 'VIP', mode: 'insensitive' } },
        }),
      );
      expect(delegate.create).toHaveBeenCalledWith({ data: { nome: 'VIP', cor: '#000000' } });
    });

    it('409 TAG_ATENDIMENTO_DUPLICADA quando o nome já existe', async () => {
      const { service, delegate } = setup();

      const erro = await service.create({ nome: 'retorno', cor: '#000000' }).catch((e) => e);

      expect(erro).toBeInstanceOf(BusinessException);
      expect((erro as BusinessException).getStatus()).toBe(409);
      expect(delegate.create).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('marca deletedAt', async () => {
      const { service, delegate } = setup();

      await service.remove(ID);

      expect(delegate.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('404 para id inválido (sem consultar) ou inexistente', async () => {
      const { service, delegate } = setup([]);

      for (const id of ['abc', ID]) {
        const erro = await service.remove(id).catch((e) => e);
        expect((erro as BusinessException).getStatus()).toBe(404);
      }
      expect(delegate.findFirst).toHaveBeenCalledTimes(1);
      expect(delegate.update).not.toHaveBeenCalled();
    });
  });
});
