import type { TransactionHost } from '@nestjs-cls/transactional';
import { Prisma } from '../../../generated/prisma/client';
import type { ExportService } from '../../../common/export/export.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { FornecedoresService } from '../../compras-estoque/fornecedores/fornecedores.service';
import type { FuncionariosService } from '../../regulatorio-qualidade/funcionarios/funcionarios.service';
import type { CentrosCustoService } from '../centros-custo/centros-custo.service';
import type { ContasPagarDuplicidadeService } from './contas-pagar-duplicidade.service';
import { CONTA_PAGAR_EXPORT_DEFINITIONS, ContasPagarService } from './contas-pagar.service';

const ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const FORNECEDOR_ID = '1c9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const CENTRO_ID = '2d9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const CONTA = {
  id: ID,
  numero: 9,
  descricao: 'Água Cuiaba',
  beneficiarioTipo: 'FORNECEDOR' as const,
  fornecedorId: FORNECEDOR_ID,
  funcionarioId: null,
  valor: new Prisma.Decimal('300.00'),
  dataVencimento: new Date('2026-11-10T00:00:00.000Z'),
  formaPagamentoId: null,
  formaPagamento: null,
  planoContaId: null,
  planoConta: null,
  centroCusto: null,
  competencia: null,
  centroCustoId: null,
  documentoArquivoId: null,
  documento: null,
  totalParcelas: 1,
  status: 'PENDENTE' as const,
  observacoes: null,
  baixas: [] as { valorPago: Prisma.Decimal }[],
  createdAt: new Date('2026-10-01T12:00:00.000Z'),
  updatedAt: new Date('2026-10-01T12:00:00.000Z'),
  deletedAt: null,
};

function setup() {
  const contaPagar = {
    findMany: jest.fn().mockResolvedValue([CONTA]),
    findFirst: jest.fn().mockResolvedValue(CONTA),
    count: jest.fn().mockResolvedValue(1),
    create: jest.fn().mockResolvedValue(CONTA),
    update: jest.fn().mockResolvedValue(CONTA),
  };
  const contaPagarBaixa = {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({}),
  };
  const formaPagamento = { findFirst: jest.fn().mockResolvedValue({ id: 'x' }) };
  const contaBancaria = { findFirst: jest.fn().mockResolvedValue({ id: 'x' }) };
  const txHost = {
    tx: { contaPagar, contaPagarBaixa, formaPagamento, contaBancaria },
  } as unknown as TransactionHost<PrismaAdapter>;
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'contas-pagar.xlsx' }),
  };
  const fornecedores = {
    findById: jest.fn().mockResolvedValue({ id: FORNECEDOR_ID, nome: 'Distribuidora Alfa' }),
  };
  const funcionarios = { findById: jest.fn() };
  const centrosCusto = {
    findById: jest.fn().mockResolvedValue({ id: CENTRO_ID, nome: 'Administrativo', ativo: true }),
  };
  const duplicidade = {
    exigirConfirmacao: jest.fn().mockResolvedValue([]),
    registrarConfirmacao: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ContasPagarService(
    txHost,
    exportService as unknown as ExportService,
    fornecedores as unknown as FornecedoresService,
    funcionarios as unknown as FuncionariosService,
    centrosCusto as unknown as CentrosCustoService,
    duplicidade as unknown as ContasPagarDuplicidadeService,
  );
  return {
    service,
    contaPagar,
    contaPagarBaixa,
    exportService,
    fornecedores,
    funcionarios,
    centrosCusto,
    duplicidade,
  };
}

describe('ContasPagarService', () => {
  it('findById resolve o nome do fornecedor pelo service exportado (sem FK)', async () => {
    const { service, fornecedores } = setup();
    const res = await service.findById(ID);
    expect(fornecedores.findById).toHaveBeenCalledWith(FORNECEDOR_ID);
    expect(res).toMatchObject({
      valor: '300',
      dataVencimento: '2026-11-10',
      beneficiarioNome: 'Distribuidora Alfa',
      valorPago: '0',
    });
  });

  it('findById devolve beneficiarioNome nulo se o fornecedor foi excluído depois', async () => {
    const { service, fornecedores } = setup();
    fornecedores.findById.mockRejectedValue(new Error('404'));
    const res = await service.findById(ID);
    expect(res.beneficiarioNome).toBeNull();
  });

  it('create valida o fornecedor e grava fornecedorId/funcionarioId conforme o tipo', async () => {
    const { service, contaPagar, fornecedores } = setup();
    await service.create({
      descricao: 'Água Cuiaba',
      beneficiarioTipo: 'FORNECEDOR',
      beneficiarioId: FORNECEDOR_ID,
      valor: 300,
      dataVencimento: '2026-11-10',
      formaPagamentoId: null,
      planoContaId: null,
      documento: null,
      totalParcelas: 1,
      status: 'PENDENTE',
      observacoes: null,
      competencia: null,
      centroCustoId: null,
      documentoArquivoId: null,
    });
    expect(fornecedores.findById).toHaveBeenCalledWith(FORNECEDOR_ID);
    expect(contaPagar.create.mock.calls[0][0].data).toMatchObject({
      fornecedorId: FORNECEDOR_ID,
      funcionarioId: null,
    });
    expect(contaPagar.create.mock.calls[0][0].data.dataVencimento).toBeInstanceOf(Date);
  });

  it('create com beneficiário FUNCIONARIO valida pelo service de funcionários', async () => {
    const { service, contaPagar, funcionarios } = setup();
    funcionarios.findById.mockResolvedValue({ id: 'x', nome: 'Fulano' });
    await service.create({
      descricao: 'Salário',
      beneficiarioTipo: 'FUNCIONARIO',
      beneficiarioId: 'x',
      valor: 100,
      dataVencimento: '2026-11-10',
      formaPagamentoId: null,
      planoContaId: null,
      documento: null,
      totalParcelas: 1,
      status: 'PENDENTE',
      observacoes: null,
      competencia: null,
      centroCustoId: null,
      documentoArquivoId: null,
    });
    expect(funcionarios.findById).toHaveBeenCalledWith('x');
    expect(contaPagar.create.mock.calls[0][0].data).toMatchObject({
      fornecedorId: null,
      funcionarioId: 'x',
    });
  });

  it('remove marca deletedAt (exclusão lógica)', async () => {
    const { service, contaPagar } = setup();
    await service.remove(ID);
    expect(contaPagar.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { deletedAt: expect.any(Date) } }),
    );
  });

  it('baixar cria a baixa e quita a conta quando a soma atinge o valor', async () => {
    const { service, contaPagarBaixa, contaPagar } = setup();
    contaPagarBaixa.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ valorPago: new Prisma.Decimal('300.00') }]);
    await service.baixar(ID, {
      dataPagamento: '2026-11-04',
      valorPago: 300,
      juros: 0,
      desconto: 0,
      formaPagamentoId: null,
      contaBancariaId: null,
      documento: null,
      observacoes: null,
      comprovanteArquivoId: null,
      justificativaDivergencia: null,
      pagamentoParcial: false,
    });
    expect(contaPagarBaixa.create).toHaveBeenCalled();
    expect(contaPagar.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PAGO' } }),
    );
  });

  it('baixar recusa conta já paga ou cancelada', async () => {
    const { service, contaPagar } = setup();
    contaPagar.findFirst.mockResolvedValue({ ...CONTA, status: 'PAGO' });
    await expect(
      service.baixar(ID, {
        dataPagamento: '2026-11-04',
        valorPago: 10,
        juros: 0,
        desconto: 0,
        formaPagamentoId: null,
        contaBancariaId: null,
        documento: null,
        observacoes: null,
        comprovanteArquivoId: null,
        justificativaDivergencia: null,
        pagamentoParcial: false,
      }),
    ).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
  });

  it('baixar com saldo parcial mantém a conta Pendente', async () => {
    const { service, contaPagarBaixa, contaPagar } = setup();
    contaPagarBaixa.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ valorPago: new Prisma.Decimal('100.00') }]);
    await service.baixar(ID, {
      dataPagamento: '2026-11-04',
      valorPago: 100,
      juros: 0,
      desconto: 0,
      formaPagamentoId: null,
      contaBancariaId: null,
      documento: null,
      observacoes: null,
      comprovanteArquivoId: null,
      justificativaDivergencia: null,
      pagamentoParcial: true,
    });
    expect(contaPagar.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PENDENTE' } }),
    );
  });

  it('cancelarBaixa exclui logicamente a baixa mais recente e recalcula o status', async () => {
    const { service, contaPagarBaixa, contaPagar } = setup();
    contaPagarBaixa.findFirst.mockResolvedValue({ id: 'baixa-1' });
    await service.cancelarBaixa(ID);
    expect(contaPagarBaixa.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'baixa-1' },
        data: { deletedAt: expect.any(Date) },
      }),
    );
    expect(contaPagar.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PENDENTE' } }),
    );
  });

  it('cancelarBaixa recusa quando não há baixa', async () => {
    const { service, contaPagarBaixa } = setup();
    contaPagarBaixa.findFirst.mockResolvedValue(null);
    await expect(service.cancelarBaixa(ID)).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
  });

  it('list filtra por status, período de vencimento e busca', async () => {
    const { service, contaPagar } = setup();
    await service.list({
      page: 1,
      pageSize: 10,
      sort: { field: 'dataVencimento', direction: 'asc' },
      search: 'agua',
      status: 'PENDENTE',
      vencimentoDe: '2026-11-01',
      vencimentoAte: '2026-11-30',
    });
    const args = contaPagar.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ status: 'PENDENTE', deletedAt: null });
    expect(args.where.dataVencimento).toEqual({
      gte: new Date('2026-11-01'),
      lte: new Date('2026-11-30'),
    });
  });

  it('list com status VENCIDO filtra Pendentes com vencimento antes de hoje', async () => {
    const { service, contaPagar } = setup();
    await service.list({
      page: 1,
      pageSize: 10,
      sort: { field: 'dataVencimento', direction: 'asc' },
      search: undefined,
      status: 'VENCIDO',
    });
    const args = contaPagar.findMany.mock.calls[0][0];
    expect(args.where.status).toBe('PENDENTE');
    expect(args.where.dataVencimento.lt).toBeInstanceOf(Date);
  });

  it('export aplica o limite e usa as colunas pedidas', async () => {
    const { service, exportService } = setup();
    await service.export({
      format: 'xlsx',
      search: undefined,
      sort: { field: 'dataVencimento', direction: 'asc' },
      columns: ['descricao', 'status'],
    });
    expect(exportService.ensureWithinLimit).toHaveBeenCalledWith(1);
    expect(
      exportService.export.mock.calls[0][0].columns.map((c: { key: string }) => c.key),
    ).toEqual(['descricao', 'status']);
    expect(CONTA_PAGAR_EXPORT_DEFINITIONS.map((c) => c.key)).toContain('beneficiario');
  });
});

const BAIXA = {
  dataPagamento: '2026-11-04',
  valorPago: 300,
  juros: 0,
  desconto: 0,
  formaPagamentoId: null,
  contaBancariaId: null,
  documento: null,
  observacoes: null,
  comprovanteArquivoId: null,
  justificativaDivergencia: null,
  pagamentoParcial: false,
};

const NOVA_CONTA = {
  descricao: 'Água Cuiaba',
  beneficiarioTipo: 'FORNECEDOR' as const,
  beneficiarioId: FORNECEDOR_ID,
  valor: 300,
  dataVencimento: '2026-11-10',
  formaPagamentoId: null,
  planoContaId: null,
  documento: null,
  totalParcelas: 1,
  status: 'PENDENTE' as const,
  observacoes: null,
  competencia: null,
  centroCustoId: null,
  documentoArquivoId: null,
};

describe('ContasPagarService: divergência na baixa (#163)', () => {
  it('valor diferente do esperado sem justificativa é recusado e nada é gravado', async () => {
    const { service, contaPagarBaixa } = setup();
    await expect(service.baixar(ID, { ...BAIXA, valorPago: 320 })).rejects.toMatchObject({
      code: 'CONTA_PAGAR_BAIXA_DIVERGENTE',
    });
    expect(contaPagarBaixa.create).not.toHaveBeenCalled();
  });

  it('valor diferente com justificativa grava a divergência (a mais é positiva)', async () => {
    const { service, contaPagarBaixa } = setup();
    await service.baixar(ID, {
      ...BAIXA,
      valorPago: 320,
      justificativaDivergencia: 'Multa por atraso cobrada pelo fornecedor',
    });
    const data = contaPagarBaixa.create.mock.calls[0][0].data;
    expect(data.divergencia.toString()).toBe('20');
    expect(data.justificativaDivergencia).toBe('Multa por atraso cobrada pelo fornecedor');
    expect(data).not.toHaveProperty('pagamentoParcial');
  });

  it('juros e desconto são campos à parte: não geram divergência', async () => {
    const { service, contaPagarBaixa } = setup();
    await service.baixar(ID, { ...BAIXA, valorPago: 300, juros: 15, desconto: 5 });
    const data = contaPagarBaixa.create.mock.calls[0][0].data;
    expect(data.divergencia).toBeNull();
    expect(data.justificativaDivergencia).toBeNull();
  });

  it('o saldo desconta as baixas anteriores', async () => {
    const { service, contaPagarBaixa } = setup();
    contaPagarBaixa.findMany.mockResolvedValue([{ valorPago: new Prisma.Decimal('100.00') }]);
    await service.baixar(ID, { ...BAIXA, valorPago: 200 });
    expect(contaPagarBaixa.create.mock.calls[0][0].data.divergencia).toBeNull();
  });

  it('pagamento parcial abaixo do esperado não é divergência', async () => {
    const { service, contaPagarBaixa } = setup();
    await service.baixar(ID, { ...BAIXA, valorPago: 100, pagamentoParcial: true });
    expect(contaPagarBaixa.create.mock.calls[0][0].data.divergencia).toBeNull();
  });

  it('pagamento parcial acima do esperado continua exigindo justificativa', async () => {
    const { service } = setup();
    await expect(
      service.baixar(ID, { ...BAIXA, valorPago: 350, pagamentoParcial: true }),
    ).rejects.toMatchObject({ code: 'CONTA_PAGAR_BAIXA_DIVERGENTE' });
  });

  it('baixa não parcial abaixo do esperado exige justificativa', async () => {
    const { service } = setup();
    await expect(service.baixar(ID, { ...BAIXA, valorPago: 100 })).rejects.toMatchObject({
      code: 'CONTA_PAGAR_BAIXA_DIVERGENTE',
    });
  });
});

describe('ContasPagarService: centro de custo, anexo e duplicidade (#163)', () => {
  it('create grava competência, centro de custo e anexo, e resolve o nome do centro', async () => {
    const { service, contaPagar, centrosCusto } = setup();
    contaPagar.create.mockResolvedValue({
      ...CONTA,
      competencia: '2026-11',
      centroCustoId: CENTRO_ID,
      centroCusto: { nome: 'Administrativo' },
      documentoArquivoId: ID,
    });
    const res = await service.create({
      ...NOVA_CONTA,
      competencia: '2026-11',
      centroCustoId: CENTRO_ID,
      documentoArquivoId: ID,
    });
    expect(centrosCusto.findById).toHaveBeenCalledWith(CENTRO_ID);
    expect(contaPagar.create.mock.calls[0][0].data).toMatchObject({
      competencia: '2026-11',
      centroCustoId: CENTRO_ID,
      documentoArquivoId: ID,
    });
    expect(res).toMatchObject({
      competencia: '2026-11',
      centroCustoId: CENTRO_ID,
      centroCustoNome: 'Administrativo',
      documentoArquivoId: ID,
    });
  });

  it('create recusa centro de custo inativo', async () => {
    const { service, centrosCusto, contaPagar } = setup();
    centrosCusto.findById.mockResolvedValue({ id: CENTRO_ID, nome: 'Antigo', ativo: false });
    await expect(service.create({ ...NOVA_CONTA, centroCustoId: CENTRO_ID })).rejects.toMatchObject(
      { code: 'BUSINESS_RULE' },
    );
    expect(contaPagar.create).not.toHaveBeenCalled();
  });

  it('create pede a confirmação da duplicidade e registra o que o usuário confirmou', async () => {
    const { service, contaPagar, duplicidade } = setup();
    const candidatos = [{ id: 'dup', motivos: ['MESMO_TITULO'] }];
    duplicidade.exigirConfirmacao.mockResolvedValue(candidatos);
    await service.create({ ...NOVA_CONTA, duplicidadeConfirmada: true });
    expect(duplicidade.exigirConfirmacao).toHaveBeenCalledWith(
      expect.objectContaining({ valor: 300 }),
      true,
    );
    expect(duplicidade.registrarConfirmacao).toHaveBeenCalledWith(CONTA.id, candidatos);
    expect(contaPagar.create.mock.calls[0][0].data).not.toHaveProperty('duplicidadeConfirmada');
  });

  it('create não grava nada se a duplicidade não foi confirmada', async () => {
    const { service, contaPagar, duplicidade } = setup();
    duplicidade.exigirConfirmacao.mockRejectedValue(
      Object.assign(new Error('dup'), { code: 'CONTA_PAGAR_POSSIVEL_DUPLICADA' }),
    );
    await expect(service.create(NOVA_CONTA)).rejects.toMatchObject({
      code: 'CONTA_PAGAR_POSSIVEL_DUPLICADA',
    });
    expect(contaPagar.create).not.toHaveBeenCalled();
  });

  it('update confere a duplicidade excluindo a própria conta', async () => {
    const { service, duplicidade } = setup();
    await service.update(ID, NOVA_CONTA);
    expect(duplicidade.exigirConfirmacao).toHaveBeenCalledWith(
      expect.objectContaining({ valor: 300 }),
      undefined,
      ID,
    );
    expect(duplicidade.registrarConfirmacao).toHaveBeenCalledWith(ID, []);
  });
});
