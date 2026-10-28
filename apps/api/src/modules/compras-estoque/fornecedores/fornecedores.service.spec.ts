import type { TransactionHost } from '@nestjs-cls/transactional';
import type { CreateFornecedorInput } from '@torres/shared';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { CONSULTA_LOOKUP } from '../../../../test/utils/tx-host-falso';
import {
  cidadeUf,
  FORNECEDOR_EXPORT_DEFINITIONS,
  FornecedoresService,
} from './fornecedores.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const FORNECEDOR = {
  id: ID,
  nome: 'Distribuidora Teste',
  documento: '11444777000161',
  email: 'contato@teste.example',
  telefone: '6533334444',
  cidade: 'Cuiabá',
  uf: 'MT',
  ativo: true,
};

const INPUT: CreateFornecedorInput = {
  nome: 'Distribuidora Teste',
  nomeFantasia: null,
  documento: null,
  email: null,
  contato: null,
  telefone: null,
  celular: null,
  cep: null,
  logradouro: null,
  numero: null,
  complemento: null,
  bairro: null,
  cidade: null,
  uf: null,
  status: 'inativo',
  observacoes: null,
};

function setup(existente: object | null = FORNECEDOR) {
  const fornecedor = {
    findMany: jest.fn().mockResolvedValue([FORNECEDOR]),
    findFirst: jest.fn().mockResolvedValue(existente),
    count: jest.fn().mockResolvedValue(1),
    create: jest.fn().mockResolvedValue(FORNECEDOR),
    update: jest.fn().mockResolvedValue(FORNECEDOR),
  };
  const txHost = { tx: { fornecedor } } as unknown as TransactionHost<PrismaAdapter>;
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'fornecedores.xlsx' }),
  };
  const service = new FornecedoresService(txHost, exportService as unknown as ExportService);
  return { service, fornecedor, exportService };
}

describe('FornecedoresService', () => {
  it('lookup: ativos, busca por nome ou documento, descrição cidade/UF', async () => {
    const { service, fornecedor } = setup();

    const page = await service.lookup({ ...CONSULTA_LOOKUP, search: '112' });

    expect(fornecedor.count.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      ativo: true,
      OR: [
        { nome: { contains: '112', mode: 'insensitive' } },
        { documento: { contains: '112', mode: 'insensitive' } },
      ],
    });
    expect(page.data[0]).toEqual({ id: ID, label: 'Distribuidora Teste', descricao: 'Cuiabá/MT' });
  });

  it('cidadeUf com partes faltando', () => {
    expect(cidadeUf({ cidade: null, uf: 'SP' })).toBe('SP');
    expect(cidadeUf({ cidade: 'Recife', uf: null })).toBe('Recife');
    expect(cidadeUf({ cidade: null, uf: null })).toBeNull();
  });

  it('404 quando não existe', async () => {
    const { service } = setup(null);

    await expect(service.findById(ID)).rejects.toMatchObject({
      message: 'Fornecedor não encontrado',
    });
  });

  it('list: sem excluídos, status vira ativo, busca em vários campos e status ordena por ativo', async () => {
    const { service, fornecedor } = setup();

    await service.list({
      page: 2,
      pageSize: 10,
      sort: { field: 'status', direction: 'desc' },
      search: 'abc',
      status: 'inativo',
    });

    const args = fornecedor.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      deletedAt: null,
      ativo: false,
      OR: ['nome', 'nomeFantasia', 'documento', 'email'].map((campo) => ({
        [campo]: { contains: 'abc', mode: 'insensitive' },
      })),
    });
    expect(args.orderBy).toEqual([{ ativo: 'desc' }, { id: 'desc' }]);
    expect(args).toMatchObject({ skip: 10, take: 10 });
  });

  it('list sem status não filtra por ativo', async () => {
    const { service, fornecedor } = setup();

    await service.list({
      page: 1,
      pageSize: 10,
      sort: { field: 'nome', direction: 'asc' },
      search: undefined,
    });

    expect(fornecedor.findMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      ativo: undefined,
    });
  });

  it('create e update gravam o status como ativo', async () => {
    const { service, fornecedor } = setup();

    await service.create(INPUT);
    await service.update(ID, { ...INPUT, status: 'ativo' });

    const dataCriada = fornecedor.create.mock.calls[0][0].data;
    expect(dataCriada).toMatchObject({ nome: INPUT.nome, ativo: false });
    expect(dataCriada).not.toHaveProperty('status');
    expect(fornecedor.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: expect.objectContaining({ nome: INPUT.nome, ativo: true }),
    });
    expect(fornecedor.update.mock.calls[0][0].data).not.toHaveProperty('status');
  });

  it('update e remove devolvem 404 quando não existe', async () => {
    const { service, fornecedor } = setup(null);

    await expect(service.update(ID, INPUT)).rejects.toMatchObject({ status: 404 });
    await expect(service.remove(ID)).rejects.toMatchObject({ status: 404 });
    expect(fornecedor.update).not.toHaveBeenCalled();
  });

  it('remove faz exclusão lógica', async () => {
    const { service, fornecedor } = setup();

    await service.remove(ID);

    expect(fornecedor.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('export usa os mesmos filtros e as colunas pedidas', async () => {
    const { service, exportService } = setup();

    await service.export({
      format: 'xlsx',
      sort: { field: 'nome', direction: 'asc' },
      columns: ['nome', 'cidade'],
      search: undefined,
      status: 'ativo',
    });

    expect(exportService.ensureWithinLimit).toHaveBeenCalledWith(1);
    const arg = exportService.export.mock.calls[0][0];
    expect(arg).toMatchObject({ format: 'xlsx', title: 'Fornecedores', rows: [FORNECEDOR] });
    expect(arg.columns.map((c: { key: string }) => c.key)).toEqual(['nome', 'cidade']);
  });

  it('colunas de exportação formatam documento vazio, cidade/UF e status', () => {
    const valor = (key: string, f: object) =>
      FORNECEDOR_EXPORT_DEFINITIONS.find((c) => c.key === key)?.value(f as never);

    expect(valor('documento', { documento: null })).toBe('');
    expect(valor('cidade', FORNECEDOR)).toBe('Cuiabá/MT');
    expect(valor('status', { ativo: false })).toBe('Inativo');
    expect(valor('status', FORNECEDOR)).toBe('Ativo');
  });
});
