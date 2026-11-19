import type { TransactionHost } from '@nestjs-cls/transactional';
import { createPrestadorSchema } from '@torres/shared';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { PRESTADOR_EXPORT_DEFINITIONS, PrestadoresService } from './prestadores.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const DATA = new Date('2026-11-18T12:00:00.000Z');

/** Registro como vem do Prisma (decimais com `toString`). */
const PRESTADOR = {
  id: ID,
  nome: 'Prestador Teste',
  nomeFantasia: null,
  tipoPessoa: 'FISICA',
  documento: null,
  telefone: '65999998888',
  email: null,
  status: 'ATIVO',
  endereco: null,
  categoria: 'AR_CONDICIONADO',
  descricaoServico: null,
  atendeUrgencia: true,
  atendeFimSemana: false,
  formaPagamento: 'PIX',
  chavePix: 'chave',
  valorHora: { toString: () => '80.5' },
  valorDiaria: null,
  emiteNotaFiscal: false,
  notaQualidade: 4,
  notaPontualidade: 3,
  avaliacaoPreco: 'JUSTO',
  observacoes: null,
  createdAt: DATA,
  updatedAt: DATA,
  deletedAt: null,
};

const ORDEM = { field: 'nome', direction: 'asc' } as const;
/** Buscas ausentes, como depois do schema da listagem. */
const SEM_BUSCA = { search: undefined, nome: undefined };

function setup(existente: object | null = PRESTADOR) {
  const prestador = {
    findMany: jest.fn().mockResolvedValue([PRESTADOR]),
    findFirst: jest.fn().mockResolvedValue(existente),
    count: jest.fn().mockResolvedValue(1),
    create: jest.fn().mockResolvedValue(PRESTADOR),
    update: jest.fn().mockResolvedValue(PRESTADOR),
  };
  const txHost = { tx: { prestador } } as unknown as TransactionHost<PrismaAdapter>;
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'prestadores.xlsx' }),
  };
  const service = new PrestadoresService(txHost, exportService as unknown as ExportService);
  return { service, prestador, exportService };
}

describe('PrestadoresService', () => {
  it('list: sem excluídos, converte decimais e datas para o DTO', async () => {
    const { service, prestador } = setup();

    const page = await service.list({ page: 1, pageSize: 10, sort: ORDEM, ...SEM_BUSCA });

    expect(prestador.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, status: undefined, categoria: undefined },
        orderBy: [{ nome: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(page.data[0]).toMatchObject({
      valorHora: 80.5,
      valorDiaria: null,
      createdAt: DATA.toISOString(),
    });
    expect(page.meta.total).toBe(1);
  });

  it('list: status, categoria e as duas buscas valem juntas', async () => {
    const { service, prestador } = setup();

    await service.list({
      page: 1,
      pageSize: 10,
      sort: ORDEM,
      status: 'BLOQUEADO',
      categoria: 'TI',
      nome: 'alfa',
      search: '6599',
    });

    const contem = (texto: string) => ({ contains: texto, mode: 'insensitive' });
    expect(prestador.findMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      status: 'BLOQUEADO',
      categoria: 'TI',
      AND: [
        { OR: [{ nome: contem('alfa') }, { nomeFantasia: contem('alfa') }] },
        {
          OR: [
            { nome: contem('6599') },
            { nomeFantasia: contem('6599') },
            { telefone: contem('6599') },
            { documento: contem('6599') },
          ],
        },
      ],
    });
  });

  it('list: Urgência e Avaliação ordenam por atendeUrgencia e notaQualidade', async () => {
    const { service, prestador } = setup();

    await service.list({
      page: 1,
      pageSize: 10,
      sort: { field: 'avaliacao', direction: 'desc' },
      ...SEM_BUSCA,
    });
    await service.list({
      page: 1,
      pageSize: 10,
      sort: { field: 'urgencia', direction: 'asc' },
      ...SEM_BUSCA,
    });

    expect(prestador.findMany.mock.calls[0][0].orderBy).toEqual([
      { notaQualidade: 'desc' },
      { id: 'desc' },
    ]);
    expect(prestador.findMany.mock.calls[1][0].orderBy).toEqual([
      { atendeUrgencia: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('findById: 404 para inexistente, excluído ou id inválido', async () => {
    const { service, prestador } = setup(null);

    await expect(service.findById(ID)).rejects.toMatchObject({
      message: 'Prestador não encontrado',
    });
    expect(prestador.findFirst).toHaveBeenCalledWith({ where: { id: ID, deletedAt: null } });

    await expect(service.findById('abc')).rejects.toMatchObject({ status: 404 });
    expect(prestador.findFirst).toHaveBeenCalledTimes(1);
  });

  it('create grava a entrada validada', async () => {
    const { service, prestador } = setup();
    const entrada = createPrestadorSchema.parse({ nome: 'Novo' });

    const criado = await service.create(entrada);

    expect(prestador.create).toHaveBeenCalledWith({ data: entrada });
    expect(criado.id).toBe(ID);
  });

  it('update confere a existência e substitui os campos', async () => {
    const { service, prestador } = setup();
    const entrada = createPrestadorSchema.parse({ nome: 'Alterado', status: 'INATIVO' });

    await service.update(ID, entrada);

    expect(prestador.update).toHaveBeenCalledWith({ where: { id: ID }, data: entrada });
  });

  it('update e remove: 404 sem gravar quando não existe', async () => {
    const { service, prestador } = setup(null);
    const entrada = createPrestadorSchema.parse({ nome: 'X' });

    await expect(service.update(ID, entrada)).rejects.toMatchObject({ status: 404 });
    await expect(service.remove(ID)).rejects.toMatchObject({ status: 404 });
    expect(prestador.update).not.toHaveBeenCalled();
  });

  it('remove faz exclusão lógica', async () => {
    const { service, prestador } = setup();

    await service.remove(ID);

    expect(prestador.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('export usa os mesmos filtros e as colunas pedidas', async () => {
    const { service, exportService, prestador } = setup();

    await service.export({
      format: 'xlsx',
      sort: ORDEM,
      columns: ['nome', 'avaliacao'],
      ...SEM_BUSCA,
      status: 'ATIVO',
    });

    expect(prestador.count).toHaveBeenCalledWith({
      where: { deletedAt: null, status: 'ATIVO', categoria: undefined },
    });
    expect(exportService.ensureWithinLimit).toHaveBeenCalledWith(1);
    const arg = exportService.export.mock.calls[0][0];
    expect(arg).toMatchObject({
      format: 'xlsx',
      title: 'Prestadores de Serviço',
      filename: 'prestadores',
      rows: [PRESTADOR],
    });
    expect(arg.columns.map((c: { key: string }) => c.key)).toEqual(['nome', 'avaliacao']);
  });

  it('colunas de exportação mostram rótulos', () => {
    const valor = (key: string, p: object) =>
      PRESTADOR_EXPORT_DEFINITIONS.find((c) => c.key === key)?.value(p as never);

    expect(valor('categoria', PRESTADOR)).toBe('Ar Condicionado');
    expect(valor('telefone', { telefone: null })).toBe('');
    expect(valor('urgencia', PRESTADOR)).toBe('Sim');
    expect(valor('urgencia', { atendeUrgencia: false })).toBe('Não');
    expect(valor('avaliacao', PRESTADOR)).toBe('4 - Bom');
    expect(valor('status', { status: 'BLOQUEADO' })).toBe('Bloqueado');
  });
});
