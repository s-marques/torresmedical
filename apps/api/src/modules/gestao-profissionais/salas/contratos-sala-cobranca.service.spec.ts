import type { TransactionHost } from '@nestjs-cls/transactional';
import type { ContratoSala } from '@torres/shared';
import type { AuditService } from '../../../common/audit/audit.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { ContasReceberService } from '../../financeiro/contas-receber/contas-receber.service';
import { ContratosSalaCobrancaService } from './contratos-sala-cobranca.service';
import type { ContratosSalaService } from './contratos-sala.service';

const SALA = 'Sala 1';

function contrato(sobrescritas: Partial<ContratoSala> = {}): ContratoSala {
  return {
    id: 'c1111111-1111-1111-1111-111111111111',
    modalidade: 'MENSAL',
    salaId: 's1111111-1111-1111-1111-111111111111',
    salaNome: SALA,
    salaNumero: '01',
    locatarioTipo: 'PROFISSIONAL',
    locatarioId: 'p1111111-1111-1111-1111-111111111111',
    locatarioNome: 'Dr. Teste',
    especialidade: null,
    valorUnitario: 1500,
    quantidadeMensal: null,
    valorTotalMensal: 1500,
    permuta: false,
    tipoReceita: 'FIXO',
    diaVencimento: 10,
    formaPagamentoId: null,
    formaPagamentoNome: null,
    indiceReajuste: 'NENHUM',
    dataInicio: '2026-01-01',
    dataFim: null,
    dias: [],
    permiteIndicacao: true,
    participaEventos: false,
    observacoes: null,
    status: 'ATIVO',
    semCobrancaNoMes: false,
    encerradoEm: null,
    motivoEncerramento: null,
    pdfArquivoId: null,
    pdfNome: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...sobrescritas,
  };
}

function setup() {
  const contratoSalaCobranca = {
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'cob-1', ...data })),
  };
  const txHost = { tx: { contratoSalaCobranca } } as unknown as TransactionHost<PrismaAdapter>;
  const contratos = {
    ativosNoPeriodo: jest.fn().mockResolvedValue([]),
    findById: jest.fn(),
  };
  const contasReceber = {
    criarDeOrigemExterna: jest.fn().mockResolvedValue({ id: 'conta-1' }),
  };
  const audit = { record: jest.fn() };
  const service = new ContratosSalaCobrancaService(
    txHost,
    contratos as unknown as ContratosSalaService,
    contasReceber as unknown as ContasReceberService,
    audit as unknown as AuditService,
  );
  return { service, contratoSalaCobranca, contratos, contasReceber, audit };
}

describe('ContratosSalaCobrancaService', () => {
  describe('gerarCobrancasDoMes', () => {
    it('gera a cobrança dos contratos Mensal ativos e sem permuta', async () => {
      const { service, contratos, contasReceber, contratoSalaCobranca } = setup();
      contratos.ativosNoPeriodo.mockResolvedValue([contrato()]);
      const resumo = await service.gerarCobrancasDoMes();
      expect(contasReceber.criarDeOrigemExterna).toHaveBeenCalledTimes(1);
      expect(contratoSalaCobranca.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ contaReceberId: 'conta-1' }),
        }),
      );
      expect(resumo.geradas).toBe(1);
      expect(resumo.jaExistentes).toBe(0);
      expect(resumo.semValorCalculavel).toHaveLength(0);
    });

    it('ignora contratos de permuta', async () => {
      const { service, contratos, contasReceber } = setup();
      contratos.ativosNoPeriodo.mockResolvedValue([contrato({ permuta: true })]);
      const resumo = await service.gerarCobrancasDoMes();
      expect(contasReceber.criarDeOrigemExterna).not.toHaveBeenCalled();
      expect(resumo.geradas).toBe(0);
      expect(resumo.jaExistentes).toBe(0);
      expect(resumo.semValorCalculavel).toHaveLength(0);
    });

    it('não duplica quando já existe cobrança no mês', async () => {
      const { service, contratos, contasReceber, contratoSalaCobranca } = setup();
      contratoSalaCobranca.findUnique.mockResolvedValue({ id: 'cob-1', contaReceberId: 'conta-1' });
      contratos.ativosNoPeriodo.mockResolvedValue([contrato()]);
      const resumo = await service.gerarCobrancasDoMes();
      expect(contasReceber.criarDeOrigemExterna).not.toHaveBeenCalled();
      expect(resumo.jaExistentes).toBe(1);
      expect(resumo.geradas).toBe(0);
    });

    it('marca contratos Por Turno como sem valor calculável', async () => {
      const { service, contratos, contasReceber } = setup();
      contratos.ativosNoPeriodo.mockResolvedValue([contrato({ modalidade: 'TURNO' })]);
      const resumo = await service.gerarCobrancasDoMes();
      expect(contasReceber.criarDeOrigemExterna).not.toHaveBeenCalled();
      expect(resumo.semValorCalculavel).toEqual([
        { contratoId: contrato().id, salaNome: SALA, locatarioNome: 'Dr. Teste' },
      ]);
    });
  });

  describe('gerarParcela', () => {
    it('gera a conta a receber e registra a cobrança do mês informado', async () => {
      const { service, contratos, contasReceber, contratoSalaCobranca } = setup();
      contratos.findById.mockResolvedValue(contrato({ modalidade: 'TURNO' }));
      await service.gerarParcela(contrato().id, {
        competencia: '2026-11',
        valor: 800,
        dataVencimento: '2026-11-10',
      });
      expect(contasReceber.criarDeOrigemExterna).toHaveBeenCalledWith(
        expect.objectContaining({ valor: 800, dataVencimento: '2026-11-10' }),
      );
      expect(contratoSalaCobranca.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ competencia: '2026-11', contaReceberId: 'conta-1' }),
        }),
      );
    });

    it('recusa quando o contrato não está ativo', async () => {
      const { service, contratos } = setup();
      contratos.findById.mockResolvedValue(contrato({ status: 'ENCERRADO' }));
      await expect(
        service.gerarParcela(contrato().id, {
          competencia: '2026-11',
          valor: 800,
          dataVencimento: '2026-11-10',
        }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('recusa quando já existe cobrança no mês informado', async () => {
      const { service, contratos, contratoSalaCobranca } = setup();
      contratos.findById.mockResolvedValue(contrato());
      contratoSalaCobranca.findUnique.mockResolvedValue({ id: 'cob-1', contaReceberId: null });
      await expect(
        service.gerarParcela(contrato().id, {
          competencia: '2026-11',
          valor: 800,
          dataVencimento: '2026-11-10',
        }),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('confirmarSemCobranca', () => {
    it('cria a linha sem conta a receber e grava a auditoria', async () => {
      const { service, contratos, contratoSalaCobranca, audit } = setup();
      contratos.findById.mockResolvedValue(contrato());
      await service.confirmarSemCobranca(contrato().id, { competencia: '2026-11' });
      expect(contratoSalaCobranca.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ competencia: '2026-11', contaReceberId: null }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE', entity: 'ContratoSalaCobranca' }),
      );
    });
  });
});
