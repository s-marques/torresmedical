import type { TransactionHost } from '@nestjs-cls/transactional';
import type { ContratoSala } from '@torres/shared';
import { escopoFalso } from '../../../../test/utils/escopo-falso';
import type { AuditService } from '../../../common/audit/audit.service';
import type { RequestContextService } from '../../../common/context/request-context.service';
import { ApiException } from '../../../common/errors/api.exception';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type {
  AgendaOcupacaoService,
  AgendamentoDaOcupacao,
} from '../../comercial-atendimento/agenda/agenda-ocupacao.service';
import type { ContratosSalaService } from '../salas/contratos-sala.service';
import type { SalasBloqueiosService } from '../salas/salas-bloqueios.service';
import type { SalasService } from '../salas/salas.service';
import { ProfissionaisClassificacaoService } from './profissionais-classificacao.service';
import type { ProfissionaisService } from './profissionais.service';

const PROF = '11111111-1111-4111-8111-111111111111';
const OUTRO = '22222222-2222-4222-8222-222222222222';
const SALA = '33333333-3333-4333-8333-333333333333';
const USUARIO = '44444444-4444-4444-8444-444444444444';
/** Terça, 24/11/2026 em São Paulo. A janela vai de 25/10 a 23/11 (quatro quartas-feiras). */
const AGORA = new Date('2026-11-24T15:00:00.000Z');

interface Cenario {
  /** Quartas-feiras da janela em que ele atendeu. */
  atendeu?: string[];
  /** Quartas-feiras contratadas por semana (cada uma vira um dia do contrato). */
  diasContratados?: number[];
  profissional?: Partial<{
    ativo: boolean;
    estrategico: boolean;
    classificacao: string | null;
    classificacaoMotivo: string | null;
    classificacaoParametros: unknown;
  }>;
  contrato?: Partial<{
    status: string;
    dataInicio: string;
    dataFim: string | null;
    assinadoEm: string | null;
  }>;
  semContrato?: boolean;
  escopo?: readonly string[];
  usuario?: string;
}

function contratoDto(diasSemana: number[]): ContratoSala {
  return {
    salaId: SALA,
    locatarioTipo: 'PROFISSIONAL',
    locatarioId: PROF,
    dataInicio: '2026-01-01',
    dataFim: null,
    dias: diasSemana.map((diaSemana) => ({ diaSemana, inicio: '08:00', fim: '12:00' })),
  } as unknown as ContratoSala;
}

function agendamento(data: string): AgendamentoDaOcupacao {
  return {
    salaId: SALA,
    profissionalId: PROF,
    data,
    inicioMinuto: 9 * 60,
    fimMinuto: 10 * 60,
    status: 'ATENDIDO',
  };
}

function montar(c: Cenario = {}) {
  const profissional = {
    id: PROF,
    ativo: true,
    estrategico: false,
    classificacao: null,
    classificacaoMotivo: null,
    classificacaoParametros: {},
    ...c.profissional,
  };
  const contratoLinha = {
    profissionalId: PROF,
    status: 'ATIVO',
    dataInicio: new Date('2026-01-01T00:00:00.000Z'),
    dataFim: null,
    assinadoEm: new Date('2026-01-01T00:00:00.000Z'),
    ...(c.contrato?.status ? { status: c.contrato.status } : {}),
    ...(c.contrato?.dataInicio
      ? { dataInicio: new Date(`${c.contrato.dataInicio}T00:00:00.000Z`) }
      : {}),
    ...(c.contrato && 'dataFim' in c.contrato
      ? { dataFim: c.contrato.dataFim ? new Date(`${c.contrato.dataFim}T00:00:00.000Z`) : null }
      : {}),
    ...(c.contrato && 'assinadoEm' in c.contrato
      ? {
          assinadoEm: c.contrato.assinadoEm
            ? new Date(`${c.contrato.assinadoEm}T00:00:00.000Z`)
            : null,
        }
      : {}),
  };
  const tx = {
    profissional: {
      findMany: jest.fn().mockResolvedValue([profissional]),
      update: jest.fn().mockResolvedValue(profissional),
    },
    contratoSala: {
      findMany: jest.fn().mockResolvedValue(c.semContrato ? [] : [contratoLinha]),
    },
    profissionalClassificacao: {
      create: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'hist-1', createdAt: AGORA, ...data }),
        ),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  const txHost = {
    tx,
    withTransaction: jest.fn((fn: () => unknown) => fn()),
  } as unknown as TransactionHost<PrismaAdapter>;
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const contexto = { getUserId: jest.fn().mockReturnValue(c.usuario ?? USUARIO) };
  const salas = { listarParaMatriz: jest.fn().mockResolvedValue([{ id: SALA, nome: 'Sala 1' }]) };
  const contratos = {
    ativosNoPeriodo: jest.fn().mockResolvedValue([contratoDto(c.diasContratados ?? [3])]),
  };
  const bloqueios = { ocorrenciasNoPeriodo: jest.fn().mockResolvedValue([]) };
  const agenda = {
    doPeriodo: jest.fn().mockResolvedValue((c.atendeu ?? []).map(agendamento)),
  };
  const profissionais = {
    garantirExiste: jest.fn().mockResolvedValue(undefined),
    detalhe: jest.fn().mockResolvedValue({ id: PROF }),
  };
  const service = new ProfissionaisClassificacaoService(
    txHost,
    audit as unknown as AuditService,
    escopoFalso(c.escopo),
    contexto as unknown as RequestContextService,
    salas as unknown as SalasService,
    contratos as unknown as ContratosSalaService,
    bloqueios as unknown as SalasBloqueiosService,
    agenda as unknown as AgendaOcupacaoService,
    profissionais as unknown as ProfissionaisService,
  );
  return { service, tx, txHost, audit, contratos, agenda, profissionais };
}

const QUARTAS_DA_JANELA = ['2026-10-28', '2026-11-04', '2026-11-11', '2026-11-18'];

describe('ProfissionaisClassificacaoService', () => {
  describe('recalcular', () => {
    it('exemplo do documento: 4 períodos contratados e 1 usado em 30 dias vira "Em risco"', async () => {
      const { service, tx, audit } = montar({ atendeu: ['2026-10-28'] });

      const r = await service.recalcular(AGORA);

      expect(r).toEqual({ avaliados: 1, alterados: 1 });
      expect(tx.profissional.update).toHaveBeenCalledWith({
        where: { id: PROF },
        data: expect.objectContaining({
          classificacao: 'EM_RISCO',
          classificacaoMotivo: 'BAIXO_USO',
          classificacaoParametros: { contratados: 4, utilizados: 1 },
          classificacaoEm: AGORA,
        }),
      });
      expect(tx.profissionalClassificacao.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          profissionalId: PROF,
          classificacaoAnterior: null,
          classificacao: 'EM_RISCO',
          motivo: 'BAIXO_USO',
          parametros: { contratados: 4, utilizados: 1 },
          origem: 'AUTOMATICO',
          usuarioId: null,
        }),
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entity: 'ProfissionalClassificacao',
          entityId: 'hist-1',
          before: null,
        }),
      );
    });

    it('a mudança de classificação guarda a anterior no histórico', async () => {
      const { service, tx } = montar({
        atendeu: QUARTAS_DA_JANELA,
        profissional: { classificacao: 'EM_RISCO', classificacaoMotivo: 'BAIXO_USO' },
      });

      await service.recalcular(AGORA);

      expect(tx.profissionalClassificacao.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          classificacaoAnterior: 'EM_RISCO',
          classificacao: 'ATIVO',
          motivo: 'USO_REGULAR',
        }),
      });
    });

    it('sem mudança não grava nada (idempotente)', async () => {
      const { service, tx, audit } = montar({
        atendeu: ['2026-10-28'],
        profissional: {
          classificacao: 'EM_RISCO',
          classificacaoMotivo: 'BAIXO_USO',
          classificacaoParametros: { contratados: 4, utilizados: 1 },
        },
      });

      const r = await service.recalcular(AGORA);

      expect(r).toEqual({ avaliados: 1, alterados: 0 });
      expect(tx.profissional.update).not.toHaveBeenCalled();
      expect(tx.profissionalClassificacao.create).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('mesma classe com números novos atualiza o cadastro, sem histórico', async () => {
      const { service, tx } = montar({
        atendeu: ['2026-10-28'],
        profissional: {
          classificacao: 'EM_RISCO',
          classificacaoMotivo: 'BAIXO_USO',
          classificacaoParametros: { contratados: 4, utilizados: 0 },
        },
      });

      const r = await service.recalcular(AGORA);

      expect(r.alterados).toBe(0);
      expect(tx.profissional.update).toHaveBeenCalledWith({
        where: { id: PROF },
        data: expect.not.objectContaining({ classificacaoEm: expect.anything() }),
      });
      expect(tx.profissionalClassificacao.create).not.toHaveBeenCalled();
    });

    it('sem contrato ativo vira "Inativo"', async () => {
      const { service, tx } = montar({ semContrato: true });

      await service.recalcular(AGORA);

      expect(tx.profissionalClassificacao.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ classificacao: 'INATIVO', motivo: 'SEM_CONTRATO_ATIVO' }),
      });
    });

    it('contrato encerrado não conta como ativo', async () => {
      const { service, tx } = montar({ contrato: { status: 'ENCERRADO' } });

      await service.recalcular(AGORA);

      expect(tx.profissionalClassificacao.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ classificacao: 'INATIVO' }),
      });
    });

    it('contrato que já terminou não é vigente hoje', async () => {
      const { service, tx } = montar({ contrato: { dataFim: '2026-11-20' } });

      await service.recalcular(AGORA);

      expect(tx.profissionalClassificacao.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ classificacao: 'INATIVO' }),
      });
    });

    it('profissional inativo vira "Inativo"', async () => {
      const { service, tx } = montar({ profissional: { ativo: false } });

      await service.recalcular(AGORA);

      expect(tx.profissionalClassificacao.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ classificacao: 'INATIVO', motivo: 'PROFISSIONAL_INATIVO' }),
      });
    });

    it('contrato assinado há menos de 90 dias é "Novo", mesmo sem uso', async () => {
      const { service, tx } = montar({
        contrato: { assinadoEm: '2026-10-20', dataInicio: '2026-10-20' },
      });

      await service.recalcular(AGORA);

      expect(tx.profissionalClassificacao.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          classificacao: 'NOVO',
          motivo: 'CONTRATO_RECENTE',
          parametros: { dias: 35 },
        }),
      });
    });

    it('a data de relacionamento é a do contrato mais antigo', async () => {
      const { service, tx } = montar({ atendeu: QUARTAS_DA_JANELA });
      tx.contratoSala.findMany.mockResolvedValue([
        {
          profissionalId: PROF,
          status: 'ATIVO',
          dataInicio: new Date('2026-11-01T00:00:00.000Z'),
          dataFim: null,
          assinadoEm: new Date('2026-11-01T00:00:00.000Z'),
        },
        {
          profissionalId: PROF,
          status: 'ENCERRADO',
          dataInicio: new Date('2025-01-01T00:00:00.000Z'),
          dataFim: new Date('2025-12-31T00:00:00.000Z'),
          assinadoEm: null,
        },
      ]);

      await service.recalcular(AGORA);

      expect(tx.profissionalClassificacao.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ classificacao: 'ATIVO' }),
      });
    });

    it('marcado como estratégico vira "Estratégico"', async () => {
      const { service, tx } = montar({
        atendeu: ['2026-10-28'],
        profissional: { estrategico: true },
      });

      await service.recalcular(AGORA);

      expect(tx.profissionalClassificacao.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          classificacao: 'ESTRATEGICO',
          motivo: 'MARCADO_ESTRATEGICO',
        }),
      });
    });

    it('mais períodos contratados por semana que 30 dias antes é "Em expansão"', async () => {
      const { service, tx, contratos } = montar({ atendeu: QUARTAS_DA_JANELA });
      // Hoje o contrato cobre quarta e quinta; 30 dias antes só a quarta.
      contratos.ativosNoPeriodo.mockResolvedValue([
        { ...contratoDto([3]), dataFim: null },
        {
          ...contratoDto([4]),
          dataInicio: '2026-11-01',
        },
      ]);

      await service.recalcular(AGORA);

      expect(tx.profissionalClassificacao.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          classificacao: 'EM_EXPANSAO',
          motivo: 'MAIS_PERIODOS',
          parametros: { semanaAnterior: 1, semanaAtual: 2 },
        }),
      });
    });

    it('atender em mais períodos do que contratou é "Em expansão"', async () => {
      const { service, tx, agenda } = montar({ atendeu: QUARTAS_DA_JANELA });
      agenda.doPeriodo.mockResolvedValue([
        ...QUARTAS_DA_JANELA.map(agendamento),
        agendamento('2026-11-05'),
        agendamento('2026-11-12'),
      ]);

      await service.recalcular(AGORA);

      expect(tx.profissionalClassificacao.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          classificacao: 'EM_EXPANSAO',
          motivo: 'USO_ACIMA_DO_CONTRATADO',
          parametros: { contratados: 4, utilizados: 6 },
        }),
      });
    });

    it('sem profissionais não consulta os outros módulos', async () => {
      const { service, tx, contratos } = montar();
      tx.profissional.findMany.mockResolvedValue([]);

      expect(await service.recalcular(AGORA)).toEqual({ avaliados: 0, alterados: 0 });
      expect(contratos.ativosNoPeriodo).not.toHaveBeenCalled();
    });

    it('usuário restrito (#153) não dispara o recálculo da clínica toda', async () => {
      const { service, txHost } = montar({ escopo: [PROF] });

      await expect(service.recalcular(AGORA)).rejects.toBeInstanceOf(ApiException);
      expect(txHost.withTransaction).not.toHaveBeenCalled();
    });

    it('a rodada inteira roda numa transação', async () => {
      const { service, txHost } = montar();

      await service.recalcular(AGORA);

      expect(txHost.withTransaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('definirEstrategico', () => {
    it('grava a marca, reclassifica na hora e registra quem mudou', async () => {
      const { service, tx, profissionais } = montar({
        atendeu: QUARTAS_DA_JANELA,
        profissional: { estrategico: true, classificacao: 'ATIVO' },
      });

      const r = await service.definirEstrategico(PROF, true, AGORA);

      expect(tx.profissional.update).toHaveBeenNthCalledWith(1, {
        where: { id: PROF },
        data: { estrategico: true },
      });
      expect(tx.profissionalClassificacao.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          classificacaoAnterior: 'ATIVO',
          classificacao: 'ESTRATEGICO',
          origem: 'MANUAL',
          usuarioId: USUARIO,
        }),
      });
      expect(profissionais.detalhe).toHaveBeenCalledWith(PROF);
      expect(r).toEqual({ id: PROF });
    });

    it('profissional fora do escopo dá 403, sem gravar', async () => {
      const { service, tx } = montar({ escopo: [OUTRO] });

      await expect(service.definirEstrategico(PROF, true, AGORA)).rejects.toBeInstanceOf(
        ApiException,
      );
      expect(tx.profissional.update).not.toHaveBeenCalled();
    });

    it('profissional que não existe propaga o 404 do cadastro', async () => {
      const { service, profissionais } = montar();
      profissionais.garantirExiste.mockRejectedValue(new ApiException(404, 'NOT_FOUND', 'x'));

      await expect(service.definirEstrategico(PROF, true, AGORA)).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('historico', () => {
    it('lista da mais recente para a mais antiga, com o motivo em texto', async () => {
      const { service, tx } = montar();
      tx.profissionalClassificacao.findMany.mockResolvedValue([
        {
          id: 'h1',
          profissionalId: PROF,
          classificacaoAnterior: 'ATIVO',
          classificacao: 'EM_RISCO',
          motivo: 'BAIXO_USO',
          parametros: { contratados: 4, utilizados: 1 },
          origem: 'AUTOMATICO',
          usuarioId: null,
          referencia: new Date('2026-11-24T00:00:00.000Z'),
          createdAt: AGORA,
        },
      ]);
      tx.profissionalClassificacao.count.mockResolvedValue(1);

      const page = await service.historico(PROF, { page: 1, pageSize: 10 });

      expect(tx.profissionalClassificacao.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { profissionalId: PROF },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
      );
      expect(page.meta.total).toBe(1);
      expect(page.data[0]).toMatchObject({
        classificacao: 'EM_RISCO',
        classificacaoAnterior: 'ATIVO',
        motivoTexto: '1 de 4 períodos usados em 30 dias',
        referencia: '2026-11-24',
        createdAt: AGORA.toISOString(),
      });
    });

    it('fora do escopo dá 403', async () => {
      const { service } = montar({ escopo: [OUTRO] });

      await expect(service.historico(PROF, { page: 1, pageSize: 10 })).rejects.toBeInstanceOf(
        ApiException,
      );
    });
  });

  describe('resumo', () => {
    const LINHAS = [
      {
        id: PROF,
        nome: 'Dra. A',
        classificacao: 'EM_RISCO',
        classificacaoMotivo: 'BAIXO_USO',
        classificacaoParametros: { contratados: 4, utilizados: 1 },
      },
      {
        id: OUTRO,
        nome: 'Dr. B',
        classificacao: 'ATIVO',
        classificacaoMotivo: 'USO_REGULAR',
        classificacaoParametros: { contratados: 4, utilizados: 4 },
      },
    ];

    it('conta por classificação e lista quem está em risco', async () => {
      const { service, tx } = montar();
      tx.profissional.findMany.mockResolvedValue(LINHAS);

      const r = await service.resumo();

      expect(r.total).toBe(2);
      expect(r.porClassificacao).toMatchObject({ EM_RISCO: 1, ATIVO: 1, NOVO: 0, INATIVO: 0 });
      expect(r.emRisco).toEqual([
        { profissionalId: PROF, nome: 'Dra. A', motivoTexto: '1 de 4 períodos usados em 30 dias' },
      ]);
    });

    it('usuário restrito vê só os profissionais do escopo', async () => {
      const { service, tx } = montar({ escopo: [OUTRO] });
      tx.profissional.findMany.mockResolvedValue(LINHAS);

      const r = await service.resumo();

      expect(r.total).toBe(1);
      expect(r.porClassificacao.EM_RISCO).toBe(0);
      expect(r.emRisco).toEqual([]);
    });
  });
});
