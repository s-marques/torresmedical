import { txHostFalso } from '../../../../test/utils/tx-host-falso';
import { Prisma } from '../../../generated/prisma/client';
import { BaseConhecimentoService } from './base-conhecimento.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const PROFISSIONAL = '1c9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const DOCUMENTO = { id: ID, titulo: 'FAQ', categoria: 'Geral', conteudo: 'Texto' };
const ENTRADA = { titulo: 'FAQ', profissionalId: null, categoria: 'Geral', conteudo: 'Texto' } as const;

function servico(documentoFindFirst: unknown = DOCUMENTO) {
  const fake = txHostFalso('documentoConhecimento', [DOCUMENTO]);
  fake.delegate.findFirst.mockResolvedValue(documentoFindFirst);
  return { service: new BaseConhecimentoService(fake.txHost), delegate: fake.delegate };
}

function erroPrisma(code: string) {
  return new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'teste' });
}

describe('BaseConhecimentoService', () => {
  it('list: sem excluídas; busca em título e conteúdo; profissional traz também os gerais', async () => {
    const { service, delegate } = servico();

    const page = await service.list({
      page: 1,
      pageSize: 10,
      sort: { field: 'titulo', direction: 'asc' },
      search: 'faq',
      profissionalId: PROFISSIONAL,
      categoria: 'Convênio',
    });

    const contem = { contains: 'faq', mode: 'insensitive' };
    expect(delegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          categoria: 'Convênio',
          AND: [
            { OR: [{ profissionalId: PROFISSIONAL }, { profissionalId: null }] },
            { OR: [{ titulo: contem }, { conteudo: contem }] },
          ],
        },
        orderBy: [{ titulo: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(page.meta.total).toBe(1);
  });

  it('findById: 404 quando não existe ou foi excluído', async () => {
    const { service, delegate } = servico(null);

    await expect(service.findById(ID)).rejects.toMatchObject({
      status: 404,
      message: 'Documento não encontrado',
    });
    expect(delegate.findFirst).toHaveBeenCalledWith({ where: { id: ID, deletedAt: null } });
  });

  it('create: grava e marca como indexado', async () => {
    const { service, delegate } = servico();

    await service.create(ENTRADA);

    expect(delegate.create).toHaveBeenCalledWith({
      data: { ...ENTRADA, indexadoEm: expect.any(Date) },
    });
  });

  it('update: 404 sem gravar quando não existe; senão substitui e reindexa', async () => {
    const naoExiste = servico(null);
    await expect(naoExiste.service.update(ID, ENTRADA)).rejects.toMatchObject({ status: 404 });
    expect(naoExiste.delegate.update).not.toHaveBeenCalled();

    const { service, delegate } = servico();
    await service.update(ID, ENTRADA);
    expect(delegate.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { ...ENTRADA, indexadoEm: expect.any(Date) },
    });
  });

  it.each(['P2003', 'P2025'])('400 PROFISSIONAL_INVALIDO quando o prisma devolve %s', async (code) => {
    const { service, delegate } = servico();
    delegate.create.mockRejectedValue(erroPrisma(code));

    await expect(service.create({ ...ENTRADA, profissionalId: PROFISSIONAL })).rejects.toMatchObject({
      status: 400,
      details: [{ field: 'profissionalId', message: 'Profissional não encontrado' }],
    });
  });

  it('repassa erros que não são de profissional', async () => {
    const { service, delegate } = servico();
    const erro = new Error('banco fora');
    delegate.create.mockRejectedValue(erro);

    await expect(service.create(ENTRADA)).rejects.toBe(erro);
  });
});
