import type { CancelamentosService } from '../../../common/cancelamentos/cancelamentos.service';
import type { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '../../../generated/prisma/client';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { FormasPagamentoService } from '../../financeiro/formas-pagamento/formas-pagamento.service';
import type { ProtocolosService } from '../../gestao-profissionais/protocolos/protocolos.service';
import type { ProtocolosMaeService } from '../../gestao-profissionais/protocolos-mae/protocolos-mae.service';
import type { ServicosProfissionaisService } from '../../gestao-profissionais/servicos-profissionais/servicos-profissionais.service';
import type { PacientesService } from '../pacientes/pacientes.service';
import { ORCAMENTO_EXPORT_DEFINITIONS, OrcamentosService, toOrcamento } from './orcamentos.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const PACIENTE = '1c9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const DATA = new Date('2026-10-01T12:00:00.000Z');

const ORCAMENTO = {
  id: ID,
  numero: 3,
  pacienteId: PACIENTE,
  formaPagamentoId: null,
  observacoes: null,
  descontoTipo: 'VALOR' as const,
  descontoValor: new Prisma.Decimal('0'),
  subtotal: new Prisma.Decimal('190'),
  total: new Prisma.Decimal('190'),
  status: 'PENDENTE' as const,
  createdAt: DATA,
  updatedAt: DATA,
  deletedAt: null,
  paciente: { nome: 'Cliente Teste' },
  formaPagamento: null,
  itens: [
    {
      id: ID,
      orcamentoId: ID,
      origem: 'SERVICO' as const,
      origemId: ID,
      descricao: 'Serviço',
      quantidade: 2,
      valorUnitario: new Prisma.Decimal('100'),
      desconto: new Prisma.Decimal('10'),
      total: new Prisma.Decimal('190'),
      posicao: 0,
    },
  ],
};

const ITEM = {
  origem: 'servico' as const,
  origemId: ID,
  descricao: 'Serviço',
  quantidade: 2,
  valorUnitario: 100,
  desconto: 10,
};
const ENTRADA = {
  pacienteId: PACIENTE,
  formaPagamentoId: null,
  observacoes: null,
  descontoTipo: 'valor' as const,
  descontoValor: 0,
  itens: [ITEM],
};

const PAGINA = { meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 } };

function setup() {
  const orcamento = {
    findMany: jest.fn().mockResolvedValue([ORCAMENTO]),
    count: jest.fn().mockResolvedValue(1),
    create: jest.fn().mockResolvedValue(ORCAMENTO),
    findFirst: jest.fn().mockResolvedValue(ORCAMENTO),
    update: jest.fn().mockResolvedValue(ORCAMENTO),
  };
  const txHost = { tx: { orcamento } } as unknown as TransactionHost<PrismaAdapter>;
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'orcamentos.xlsx' }),
  };
  const pacientes = { findLookupById: jest.fn().mockResolvedValue({}) };
  const formas = { findLookupById: jest.fn().mockResolvedValue({}) };
  const servicos = {
    findById: jest.fn().mockResolvedValue({}),
    list: jest.fn().mockResolvedValue({
      ...PAGINA,
      data: [{ id: ID, nome: 'Acupuntura', profissionalNome: 'Prof. Teste', valor: 250 }],
    }),
  };
  const protocolos = {
    findById: jest.fn().mockResolvedValue({}),
    list: jest.fn().mockResolvedValue({
      ...PAGINA,
      data: [{ id: ID, nome: 'P1', profissionalNome: null, categoria: 'Geral', valorTotal: 90 }],
    }),
  };
  const protocolosMae = {
    findById: jest.fn().mockResolvedValue({}),
    list: jest.fn().mockResolvedValue({
      ...PAGINA,
      data: [{ id: ID, nome: 'M1', categoria: 'Emagrecimento', valorTotal: 900 }],
    }),
  };
  const cancelamentos = {
    registrar: jest.fn().mockResolvedValue({ motivo: 'Motivo fictício' }),
    registrarContratoCancelado: jest.fn(),
    registrarNegocioPerdido: jest.fn(),
  };
  const service = new OrcamentosService(
    txHost,
    exportService as unknown as ExportService,
    pacientes as unknown as PacientesService,
    formas as unknown as FormasPagamentoService,
    servicos as unknown as ServicosProfissionaisService,
    protocolos as unknown as ProtocolosService,
    protocolosMae as unknown as ProtocolosMaeService,
    cancelamentos as unknown as CancelamentosService,
  );
  return {
    service,
    cancelamentos,
    orcamento,
    exportService,
    pacientes,
    formas,
    servicos,
    protocolos,
    protocolosMae,
  };
}

const consulta = (extra: object = {}) => ({
  page: 1,
  pageSize: 10,
  sort: { field: 'data' as const, direction: 'desc' as const },
  search: undefined,
  status: undefined,
  ...extra,
});

describe('OrcamentosService', () => {
  it('toOrcamento converte decimais em texto, datas em ISO e origem em kebab-case', () => {
    expect(toOrcamento(ORCAMENTO)).toMatchObject({
      numero: 3,
      data: '2026-10-01T12:00:00.000Z',
      cliente: 'Cliente Teste',
      formaPagamento: null,
      descontoTipo: 'valor',
      total: '190',
      itens: [{ origem: 'servico', valorUnitario: '100', desconto: '10', total: '190' }],
    });
  });

  it('list ignora excluídos, filtra status e busca por cliente', async () => {
    const { service, orcamento } = setup();
    const res = await service.list(consulta({ status: 'aprovado', search: 'ana' }));
    expect(res.data).toHaveLength(1);
    expect(orcamento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          status: 'APROVADO',
          paciente: { nome: { contains: 'ana', mode: 'insensitive' } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 10,
      }),
    );
  });

  it.each([
    ['id', { numero: 'asc' }],
    ['cliente', { paciente: { nome: 'asc' } }],
    ['total', { total: 'asc' }],
    ['status', { status: 'asc' }],
  ])('list ordena por %s', async (field, esperado) => {
    const { service, orcamento } = setup();
    await service.list(consulta({ sort: { field, direction: 'asc' } }));
    expect(orcamento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [esperado, { id: 'asc' }] }),
    );
  });

  it('create recalcula os totais no servidor e grava como Pendente', async () => {
    const { service, orcamento, pacientes, servicos } = setup();
    await service.create({ ...ENTRADA, descontoTipo: 'percentual', descontoValor: 10 });
    expect(pacientes.findLookupById).toHaveBeenCalledWith(PACIENTE);
    expect(servicos.findById).toHaveBeenCalledWith(ID);
    const { data } = orcamento.create.mock.calls[0][0];
    expect(data).toMatchObject({
      descontoTipo: 'PERCENTUAL',
      descontoValor: 10,
      subtotal: 190,
      total: 171,
    });
    expect(data.itens.create).toEqual([
      expect.objectContaining({ origem: 'SERVICO', total: 190, posicao: 0 }),
    ]);
    expect(data.status).toBeUndefined();
  });

  it('create sem cliente nem forma de pagamento não consulta esses cadastros', async () => {
    const { service, pacientes, formas } = setup();
    await service.create({ ...ENTRADA, pacienteId: null });
    expect(pacientes.findLookupById).not.toHaveBeenCalled();
    expect(formas.findLookupById).not.toHaveBeenCalled();
  });

  it('create valida forma de pagamento e a origem de protocolos e protocolos mãe', async () => {
    const { service, formas, protocolos, protocolosMae } = setup();
    await service.create({
      ...ENTRADA,
      formaPagamentoId: ID,
      itens: [
        { ...ITEM, origem: 'protocolo' },
        { ...ITEM, origem: 'protocolo-mae' },
      ],
    });
    expect(formas.findLookupById).toHaveBeenCalledWith(ID);
    expect(protocolos.findById).toHaveBeenCalledWith(ID);
    expect(protocolosMae.findById).toHaveBeenCalledWith(ID);
  });

  it('create não grava quando o cadastro de origem não existe', async () => {
    const { service, orcamento, servicos } = setup();
    servicos.findById.mockRejectedValue(new Error('NOT_FOUND'));
    await expect(service.create(ENTRADA)).rejects.toThrow('NOT_FOUND');
    expect(orcamento.create).not.toHaveBeenCalled();
  });

  it('catalogo lista serviços ativos com o profissional', async () => {
    const { service, servicos } = setup();
    const r = await service.catalogo({ tipo: 'servico', page: 1, pageSize: 20, search: 'acu' });
    expect(servicos.list).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'acu', status: 'ativo', pageSize: 20 }),
    );
    expect(r.data).toEqual([{ id: ID, nome: 'Acupuntura', detalhe: 'Prof. Teste', valor: 250 }]);
  });

  it('catalogo lista protocolos e protocolos mãe pelo valor total', async () => {
    const { service } = setup();
    const p = await service.catalogo({
      tipo: 'protocolo',
      page: 1,
      pageSize: 20,
      search: undefined,
    });
    expect(p.data).toEqual([{ id: ID, nome: 'P1', detalhe: 'Geral', valor: 90 }]);
    const m = await service.catalogo({
      tipo: 'protocolo-mae',
      page: 1,
      pageSize: 20,
      search: undefined,
    });
    expect(m.data).toEqual([{ id: ID, nome: 'M1', detalhe: 'Emagrecimento', valor: 900 }]);
  });

  it('export respeita o limite e usa as colunas do grid', async () => {
    const { service, exportService } = setup();
    await service.export({ ...consulta(), format: 'xlsx', columns: ['id', 'total'] });
    expect(exportService.ensureWithinLimit).toHaveBeenCalledWith(1);
    expect(exportService.export).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'orcamentos', format: 'xlsx' }),
    );
  });

  it('colunas exportadas: cliente vazio vira "-" e status ganha rótulo', () => {
    const o = toOrcamento({ ...ORCAMENTO, paciente: null, pacienteId: null });
    const valor = (key: string) =>
      ORCAMENTO_EXPORT_DEFINITIONS.find((c) => c.key === key)?.value(o);
    expect(valor('cliente')).toBe('-');
    expect(valor('status')).toBe('Pendente');
    expect(valor('id')).toBe(3);
  });

  describe('cancelar (issue #162)', () => {
    const MOTIVO_ID = '5b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
    const ENTRADA = { motivoId: MOTIVO_ID, observacao: undefined };

    it.each(['PENDENTE', 'APROVADO'] as const)(
      'cancela o orçamento %s e registra o motivo',
      async (status) => {
        const { service, orcamento, cancelamentos } = setup();
        orcamento.findFirst.mockResolvedValue({ ...ORCAMENTO, status });
        orcamento.update.mockResolvedValue({ ...ORCAMENTO, status: 'CANCELADO' });

        const cancelado = await service.cancelar(ID, { ...ENTRADA, observacao: 'Sem retorno' });

        expect(cancelamentos.registrar).toHaveBeenCalledWith({
          tipo: 'PROPOSTA',
          entidade: 'Orcamento',
          entidadeId: ID,
          motivoId: MOTIVO_ID,
          observacao: 'Sem retorno',
        });
        expect(orcamento.update).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: ID }, data: { status: 'CANCELADO' } }),
        );
        expect(cancelado.status).toBe('CANCELADO');
      },
    );

    it.each(['CONCLUIDO', 'CANCELADO'] as const)(
      'orçamento %s não pode ser cancelado (409)',
      async (status) => {
        const { service, orcamento, cancelamentos } = setup();
        orcamento.findFirst.mockResolvedValue({ ...ORCAMENTO, status });

        await expect(service.cancelar(ID, ENTRADA)).rejects.toMatchObject({ status: 409 });
        expect(cancelamentos.registrar).not.toHaveBeenCalled();
        expect(orcamento.update).not.toHaveBeenCalled();
      },
    );

    it('404 para id inválido ou inexistente, sem registrar', async () => {
      const { service, orcamento, cancelamentos } = setup();
      orcamento.findFirst.mockResolvedValue(null);

      await expect(service.cancelar(ID, ENTRADA)).rejects.toMatchObject({ status: 404 });
      await expect(service.cancelar('x', ENTRADA)).rejects.toMatchObject({ status: 404 });
      expect(cancelamentos.registrar).not.toHaveBeenCalled();
    });
  });
});
