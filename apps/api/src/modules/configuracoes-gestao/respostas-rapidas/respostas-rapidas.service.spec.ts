import { txHostFalso } from '../../../../test/utils/tx-host-falso';
import { RespostasRapidasService } from './respostas-rapidas.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const RESPOSTA = {
  id: ID,
  titulo: 'Boas-vindas',
  mensagem: 'Olá!',
  categoria: 'Geral',
  atalho: '/boasvindas',
};
const ENTRADA = { titulo: 'Retorno', mensagem: 'Lembrete', categoria: 'Geral', atalho: '/retorno' };

/** `findFirst` devolve em sequência: busca por id, depois checagem do atalho. */
function servico(...respostasFindFirst: unknown[]) {
  const fake = txHostFalso('respostaRapida', [RESPOSTA]);
  for (const resposta of respostasFindFirst) {
    fake.delegate.findFirst.mockResolvedValueOnce(resposta);
  }
  return { service: new RespostasRapidasService(fake.txHost), delegate: fake.delegate };
}

describe('RespostasRapidasService', () => {
  it('list: sem excluídas, busca em título, mensagem, categoria e atalho', async () => {
    const { service, delegate } = servico();

    const page = await service.list({
      page: 1,
      pageSize: 100,
      sort: { field: 'titulo', direction: 'asc' },
      search: 'boas',
    });

    const contem = { contains: 'boas', mode: 'insensitive' };
    expect(delegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          OR: [{ titulo: contem }, { mensagem: contem }, { categoria: contem }, { atalho: contem }],
        },
        orderBy: [{ titulo: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(page.meta.total).toBe(1);
  });

  it('findById: 404 quando não existe ou foi excluída', async () => {
    const { service, delegate } = servico(null);

    await expect(service.findById(ID)).rejects.toMatchObject({
      message: 'Resposta rápida não encontrada',
    });
    expect(delegate.findFirst).toHaveBeenCalledWith({ where: { id: ID, deletedAt: null } });
  });

  describe('create', () => {
    it('grava quando o atalho está livre (sem diferenciar maiúsculas)', async () => {
      const { service, delegate } = servico(null);

      await service.create(ENTRADA);

      expect(delegate.findFirst).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          atalho: { equals: '/retorno', mode: 'insensitive' },
          id: undefined,
        },
        select: { id: true },
      });
      expect(delegate.create).toHaveBeenCalledWith({ data: ENTRADA });
    });

    it('sem atalho não consulta duplicidade', async () => {
      const { service, delegate } = servico();

      await service.create({ ...ENTRADA, atalho: null });

      expect(delegate.findFirst).not.toHaveBeenCalled();
      expect(delegate.create).toHaveBeenCalled();
    });

    it('400 ATALHO_DUPLICADO no campo atalho quando o atalho já existe', async () => {
      const { service, delegate } = servico({ id: 'outro' });

      await expect(service.create(ENTRADA)).rejects.toMatchObject({
        code: 'ATALHO_DUPLICADO',
        details: [{ field: 'atalho', message: 'Já existe uma resposta rápida com este atalho' }],
      });
      expect(delegate.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('substitui os campos, ignorando a própria resposta na checagem do atalho', async () => {
      const { service, delegate } = servico(RESPOSTA, null);

      await service.update(ID, ENTRADA);

      expect(delegate.findFirst).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { not: ID } }),
        }),
      );
      expect(delegate.update).toHaveBeenCalledWith({ where: { id: ID }, data: ENTRADA });
    });

    it('404 quando não existe e ATALHO_DUPLICADO quando o atalho é de outra resposta', async () => {
      const inexistente = servico(null);
      await expect(inexistente.service.update(ID, ENTRADA)).rejects.toMatchObject({
        status: 404,
      });
      expect(inexistente.delegate.update).not.toHaveBeenCalled();

      const duplicado = servico(RESPOSTA, { id: 'outro' });
      await expect(duplicado.service.update(ID, ENTRADA)).rejects.toMatchObject({
        code: 'ATALHO_DUPLICADO',
      });
      expect(duplicado.delegate.update).not.toHaveBeenCalled();
    });
  });

  it('remove faz exclusão lógica', async () => {
    const { service, delegate } = servico();

    await service.remove(ID);

    expect(delegate.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { deletedAt: expect.any(Date) },
    });
  });
});
