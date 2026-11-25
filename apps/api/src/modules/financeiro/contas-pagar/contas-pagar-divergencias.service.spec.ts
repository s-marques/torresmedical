import type { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '../../../generated/prisma/client';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { FornecedoresService } from '../../compras-estoque/fornecedores/fornecedores.service';
import type { FuncionariosService } from '../../regulatorio-qualidade/funcionarios/funcionarios.service';
import {
  CONTA_PAGAR_DIVERGENCIA_EXPORT_DEFINITIONS,
  ContasPagarDivergenciasService,
} from './contas-pagar-divergencias.service';

const FORNECEDOR_ID = '1c9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const BAIXA = {
  id: '4f9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  contaPagarId: '5a9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  dataPagamento: new Date('2026-11-04T00:00:00.000Z'),
  valorPago: new Prisma.Decimal('320.00'),
  divergencia: new Prisma.Decimal('20.00'),
  justificativaDivergencia: 'Multa por atraso',
  contaPagar: {
    numero: 7,
    descricao: 'Energia',
    valor: new Prisma.Decimal('300.00'),
    beneficiarioTipo: 'FORNECEDOR' as const,
    fornecedorId: FORNECEDOR_ID,
    funcionarioId: null,
    deletedAt: null,
  },
};

function setup() {
  const contaPagarBaixa = {
    findMany: jest.fn().mockResolvedValue([BAIXA]),
    count: jest.fn().mockResolvedValue(1),
  };
  const txHost = { tx: { contaPagarBaixa } } as unknown as TransactionHost<PrismaAdapter>;
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'contas-pagar-divergencias.xlsx' }),
  };
  const fornecedores = { findById: jest.fn().mockResolvedValue({ nome: 'Distribuidora Alfa' }) };
  const funcionarios = { findById: jest.fn() };
  const service = new ContasPagarDivergenciasService(
    txHost,
    exportService as unknown as ExportService,
    fornecedores as unknown as FornecedoresService,
    funcionarios as unknown as FuncionariosService,
  );
  return { service, contaPagarBaixa, exportService };
}

const QUERY = {
  page: 1,
  pageSize: 10,
  sort: { field: 'dataPagamento' as const, direction: 'desc' as const },
  search: undefined,
};

describe('ContasPagarDivergenciasService', () => {
  it('lista só baixas ativas com divergência, de contas não excluídas', async () => {
    const { service, contaPagarBaixa } = setup();
    const res = await service.list({
      ...QUERY,
      pagamentoDe: '2026-11-01',
      pagamentoAte: '2026-11-30',
    });
    expect(contaPagarBaixa.findMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      divergencia: { not: null },
      contaPagar: { deletedAt: null },
      dataPagamento: { gte: new Date('2026-11-01'), lte: new Date('2026-11-30') },
    });
    expect(res.data).toEqual([
      {
        baixaId: BAIXA.id,
        contaPagarId: BAIXA.contaPagarId,
        numero: 7,
        descricao: 'Energia',
        beneficiarioNome: 'Distribuidora Alfa',
        valor: '300',
        valorPago: '320',
        divergencia: '20',
        justificativa: 'Multa por atraso',
        dataPagamento: '2026-11-04',
      },
    ]);
  });

  it('ordena pelo campo pedido e desempata pelo id', async () => {
    const { service, contaPagarBaixa } = setup();
    await service.list({ ...QUERY, sort: { field: 'divergencia', direction: 'asc' } });
    expect(contaPagarBaixa.findMany.mock.calls[0][0].orderBy).toEqual([
      { divergencia: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('export aplica o limite e usa as colunas pedidas', async () => {
    const { service, exportService } = setup();
    await service.export({ ...QUERY, format: 'xlsx', columns: ['descricao', 'divergencia'] });
    expect(exportService.ensureWithinLimit).toHaveBeenCalledWith(1);
    expect(
      exportService.export.mock.calls[0][0].columns.map((c: { key: string }) => c.key),
    ).toEqual(['descricao', 'divergencia']);
    expect(CONTA_PAGAR_DIVERGENCIA_EXPORT_DEFINITIONS.map((c) => c.key)).toContain('justificativa');
  });
});
