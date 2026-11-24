import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  camposCadastroPendentes,
  diasParaVencer,
  ONBOARDING_ETAPA_MANUAL,
  ONBOARDING_ETAPAS,
  ONBOARDING_ETAPAS_OBRIGATORIAS,
  ONBOARDING_PRAZO_DIAS,
  tiposObrigatoriosOnboarding,
  type ListOnboardingQuery,
  type Onboarding,
  type OnboardingEtapa,
  type OnboardingEtapaItem,
  type ProfissionalDocumentoSituacaoGravada,
  type ProfissionalDocumentoTipo,
} from '@torres/shared';
import { AuditService } from '../../../common/audit/audit.service';
import { EscopoDadosService } from '../../../common/auth/escopo-dados.service';
import { isUuid } from '../../../common/auth/tokens';
import { RequestContextService } from '../../../common/context/request-context.service';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { Page } from '../../../common/pagination/paginate';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { Prisma } from '../../../generated/prisma/client';
import { PacientesVinculadosService } from '../../consultorio-assistencial/pacientes-vinculados/pacientes-vinculados.service';
import { UsuariosLookupService } from '../../configuracoes-gestao/usuarios/usuarios.service';
import { hojeEmSaoPaulo } from '../salas/data-local';

const NAO_EXCLUIDO = { deletedAt: null } as const;

/** Tudo que as etapas automáticas leem do profissional e do contrato, numa consulta só. */
const INCLUDE = {
  profissional: {
    select: {
      id: true,
      nome: true,
      ativo: true,
      profissao: true,
      registro: true,
      especialidadeId: true,
      cpf: true,
      rg: true,
      dataNascimento: true,
      endereco: true,
      telefone: true,
      email: true,
      cnpj: true,
      _count: { select: { rqes: true, contatosAdministrativos: true, horarios: true } },
      documentos: {
        where: NAO_EXCLUIDO,
        select: { tipo: true, situacao: true, validade: true },
      },
      contratosSala: {
        where: { ...NAO_EXCLUIDO, status: 'ATIVO' },
        select: { id: true },
        take: 1,
      },
    },
  },
  contrato: {
    select: {
      sala: { select: { nome: true } },
      dias: { orderBy: { diaSemana: 'asc' } },
    },
  },
} satisfies Prisma.ProfissionalOnboardingInclude;

type OnboardingComRelacoes = Prisma.ProfissionalOnboardingGetPayload<{ include: typeof INCLUDE }>;

const SOMENTE_DATA = (data: Date): string => data.toISOString().slice(0, 10);

/** Fatos de outros módulos, buscados em lote para a lista de onboardings. */
interface Fatos {
  comAcesso: ReadonlySet<string>;
  comAtendimento: ReadonlySet<string>;
  nomesUsuarios: ReadonlyMap<string, string>;
}

/**
 * Onboarding do profissional (issue #142): checklist criado na assinatura do contrato de sala.
 * Só a recepção orientada é gravada; as demais etapas são avaliadas na leitura pelo dado de
 * origem, então nunca ficam fora de sincronia. O profissional só é ativado com as etapas
 * obrigatórias concluídas (`garantirPodeAtivar`).
 */
@Injectable()
export class ProfissionaisOnboardingService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly usuarios: UsuariosLookupService,
    private readonly atendimentos: PacientesVinculadosService,
    private readonly audit: AuditService,
    private readonly escopo: EscopoDadosService,
    private readonly contexto: RequestContextService,
  ) {}

  /** Checklist do profissional; `null` quando ele não passou por um contrato assinado. */
  async obter(profissionalId: string, agora = new Date()): Promise<Onboarding | null> {
    await this.garantirProfissional(profissionalId);
    const registro = await this.txHost.tx.profissionalOnboarding.findUnique({
      where: { profissionalId },
      include: INCLUDE,
    });
    if (!registro) return null;
    const [dto] = await this.montar([registro], hojeEmSaoPaulo(agora));
    return dto ?? null;
  }

  /**
   * "Onboarding em andamento": checklists ainda não concluídos, dos profissionais do escopo do
   * usuário. Como a conclusão é calculada, filtra, ordena e pagina em memória (poucos registros).
   */
  async listar(query: ListOnboardingQuery, agora = new Date()): Promise<Page<Onboarding>> {
    const registros = await this.txHost.tx.profissionalOnboarding.findMany({
      where: {
        profissionalId: this.escopo.filtroProfissional(),
        profissional: {
          ...NAO_EXCLUIDO,
          ...(query.search ? { nome: { contains: query.search, mode: 'insensitive' } } : {}),
        },
      },
      include: INCLUDE,
    });
    const todos = await this.montar(registros, hojeEmSaoPaulo(agora));
    const filtrados = todos.filter(
      (o) => !o.completo && (query.situacao !== 'ATRASADO' || o.atrasada),
    );
    const { field, direction } = query.sort;
    const fator = direction === 'asc' ? 1 : -1;
    const chave = (o: Onboarding): string | number =>
      field === 'profissionalNome'
        ? o.profissionalNome.toLocaleLowerCase('pt-BR')
        : field === 'concluidas'
          ? o.concluidas
          : o.iniciadoEm;
    filtrados.sort((a, b) => {
      const [x, y] = [chave(a), chave(b)];
      const ordem = x < y ? -1 : x > y ? 1 : 0;
      return ordem * fator || a.id.localeCompare(b.id);
    });
    const inicio = (query.page - 1) * query.pageSize;
    return {
      data: filtrados.slice(inicio, inicio + query.pageSize),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: filtrados.length,
        totalPages: Math.ceil(filtrados.length / query.pageSize),
      },
    };
  }

  /**
   * Cria o checklist na assinatura do contrato. O profissional tem um só onboarding: um segundo
   * contrato assinado não cria outro (nem recomeça os prazos).
   */
  async iniciar(profissionalId: string, contratoSalaId: string, assinadoEm: Date): Promise<void> {
    const existente = await this.txHost.tx.profissionalOnboarding.findUnique({
      where: { profissionalId },
      select: { id: true },
    });
    if (existente) return;
    const criado = await this.txHost.tx.profissionalOnboarding.create({
      data: { profissionalId, contratoSalaId, iniciadoEm: assinadoEm },
    });
    await this.audit.record({
      action: 'CREATE',
      entity: 'ProfissionalOnboarding',
      entityId: criado.id,
      before: null,
      after: criado,
    });
  }

  /** Marca ou desmarca "Recepção orientada" (a única etapa manual), com quem e quando. */
  async definirRecepcao(
    onboardingId: string,
    orientada: boolean,
    agora = new Date(),
  ): Promise<Onboarding> {
    const registro = isUuid(onboardingId)
      ? await this.txHost.tx.profissionalOnboarding.findUnique({
          where: { id: onboardingId },
          include: INCLUDE,
        })
      : null;
    if (!registro || registro.profissional === null) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Onboarding não encontrado', {
        status: 404,
      });
    }
    this.escopo.garantirProfissional(registro.profissionalId);
    const usuarioId = this.usuarioAtual();
    const alterado = await this.txHost.tx.profissionalOnboarding.update({
      where: { id: onboardingId },
      data: {
        recepcaoOrientadaEm: orientada ? agora : null,
        recepcaoOrientadaPorId: orientada ? usuarioId : null,
      },
      include: INCLUDE,
    });
    const [dto] = await this.montar([alterado], hojeEmSaoPaulo(agora));
    return dto as Onboarding;
  }

  /**
   * Regra de ativação: com onboarding em andamento, o profissional só passa a ativo com todas as
   * etapas obrigatórias concluídas. Sem onboarding (cadastros anteriores à #142) nada muda.
   */
  async garantirPodeAtivar(profissionalId: string, agora = new Date()): Promise<void> {
    const registro = await this.txHost.tx.profissionalOnboarding.findUnique({
      where: { profissionalId },
      include: INCLUDE,
    });
    if (!registro) return;
    const [dto] = await this.montar([registro], hojeEmSaoPaulo(agora));
    if (dto && !dto.podeAtivar) {
      const pendentes = dto.etapas
        .filter((e) => !e.concluida && e.etapa !== 'PROFISSIONAL_ATIVO')
        .map((e) => e.etapa);
      throw new BusinessException(
        'ONBOARDING_INCOMPLETO',
        'Conclua as etapas do onboarding antes de ativar o profissional.',
        {
          status: 409,
          details: pendentes.map((etapa) => ({
            field: 'etapa',
            message: etapa,
          })),
        },
      );
    }
  }

  // --- Internos ------------------------------------------------------------------------

  private async garantirProfissional(profissionalId: string): Promise<void> {
    const existe = isUuid(profissionalId)
      ? await this.txHost.tx.profissional.count({
          where: { id: profissionalId, ...NAO_EXCLUIDO },
        })
      : 0;
    if (existe === 0) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Profissional não encontrado', {
        status: 404,
      });
    }
    this.escopo.garantirProfissional(profissionalId);
  }

  private usuarioAtual(): string | null {
    const id = this.contexto.getUserId();
    return id && isUuid(id) ? id : null;
  }

  private async buscarFatos(registros: readonly OnboardingComRelacoes[]): Promise<Fatos> {
    const profissionalIds = registros.map((r) => r.profissionalId);
    const [comAcesso, comAtendimento, nomesUsuarios] = await Promise.all([
      this.usuarios.profissionaisComAcesso(profissionalIds),
      this.atendimentos.profissionaisComAtendimentoFinalizado(profissionalIds),
      this.usuarios.nomesPorIds(
        registros.flatMap((r) => (r.recepcaoOrientadaPorId ? [r.recepcaoOrientadaPorId] : [])),
      ),
    ]);
    return { comAcesso, comAtendimento, nomesUsuarios };
  }

  private async montar(
    registros: readonly OnboardingComRelacoes[],
    hoje: string,
  ): Promise<Onboarding[]> {
    if (registros.length === 0) return [];
    const fatos = await this.buscarFatos(registros);
    return registros.map((registro) => this.toDto(registro, fatos, hoje));
  }

  private toDto(registro: OnboardingComRelacoes, fatos: Fatos, hoje: string): Onboarding {
    const iniciadoEm = SOMENTE_DATA(registro.iniciadoEm);
    const diasEmAndamento = Math.max(0, diasParaVencer(hoje, iniciadoEm));
    const vencido = diasEmAndamento > ONBOARDING_PRAZO_DIAS;
    const { profissional } = registro;

    const camposPendentes = camposCadastroPendentes({
      ...profissional,
      nome: profissional.nome,
      profissao: profissional.profissao,
      contatosAdministrativos: profissional._count.contatosAdministrativos,
    });
    const tiposPendentes = this.documentosPendentes(profissional, hoje);
    const comAcesso = fatos.comAcesso.has(profissional.id);

    const etapa = (
      chave: OnboardingEtapa,
      concluida: boolean,
      extra: Partial<OnboardingEtapaItem> = {},
    ): OnboardingEtapaItem => ({
      etapa: chave,
      concluida,
      automatica: chave !== ONBOARDING_ETAPA_MANUAL,
      concluidaEm: null,
      concluidaPorId: null,
      concluidaPorNome: null,
      atrasada: !concluida && vencido,
      pendencias: [],
      ...extra,
    });

    const orientada = registro.recepcaoOrientadaEm !== null;
    const porEtapa: Record<OnboardingEtapa, OnboardingEtapaItem> = {
      CONTRATO_ASSINADO: etapa('CONTRATO_ASSINADO', true, {
        concluidaEm: `${iniciadoEm}T00:00:00.000Z`,
      }),
      CADASTRO_COMPLETO: etapa('CADASTRO_COMPLETO', camposPendentes.length === 0, {
        pendencias: camposPendentes,
      }),
      DOCUMENTACAO_VALIDADA: etapa('DOCUMENTACAO_VALIDADA', tiposPendentes.length === 0, {
        pendencias: tiposPendentes,
      }),
      SALA_DEFINIDA: etapa('SALA_DEFINIDA', profissional.contratosSala.length > 0),
      AGENDA_CONFIGURADA: etapa('AGENDA_CONFIGURADA', profissional._count.horarios > 0),
      ACESSO_CRIADO: etapa('ACESSO_CRIADO', comAcesso),
      RECEPCAO_ORIENTADA: etapa('RECEPCAO_ORIENTADA', orientada, {
        concluidaEm: registro.recepcaoOrientadaEm?.toISOString() ?? null,
        concluidaPorId: registro.recepcaoOrientadaPorId,
        concluidaPorNome: registro.recepcaoOrientadaPorId
          ? (fatos.nomesUsuarios.get(registro.recepcaoOrientadaPorId) ?? null)
          : null,
      }),
      PRIMEIRO_ATENDIMENTO: etapa(
        'PRIMEIRO_ATENDIMENTO',
        fatos.comAtendimento.has(profissional.id),
      ),
      PROFISSIONAL_ATIVO: etapa('PROFISSIONAL_ATIVO', profissional.ativo),
    };
    const etapas = ONBOARDING_ETAPAS.map((chave) => porEtapa[chave]);
    const concluidas = etapas.filter((e) => e.concluida).length;

    return {
      id: registro.id,
      profissionalId: profissional.id,
      profissionalNome: profissional.nome,
      contratoSalaId: registro.contratoSalaId,
      salaNome: registro.contrato.sala.nome,
      iniciadoEm,
      diasEmAndamento,
      etapas,
      concluidas,
      total: etapas.length,
      completo: concluidas === etapas.length,
      atrasada: etapas.some((e) => e.atrasada),
      podeAtivar: ONBOARDING_ETAPAS_OBRIGATORIAS.every((chave) => porEtapa[chave].concluida),
      sugestoes: {
        horarios:
          profissional._count.horarios === 0
            ? registro.contrato.dias.map(({ diaSemana, inicio, fim }) => ({
                diaSemana,
                inicio,
                fim,
              }))
            : [],
        criarUsuario: !comAcesso,
      },
    };
  }

  /** Tipos obrigatórios sem documento validado e dentro da validade. */
  private documentosPendentes(
    profissional: OnboardingComRelacoes['profissional'],
    hoje: string,
  ): ProfissionalDocumentoTipo[] {
    const obrigatorios = tiposObrigatoriosOnboarding(
      profissional.profissao,
      profissional._count.rqes > 0,
    );
    return obrigatorios.filter(
      (tipo) =>
        !profissional.documentos.some(
          (d) =>
            d.tipo === tipo &&
            (d.situacao as ProfissionalDocumentoSituacaoGravada) === 'VALIDADO' &&
            (d.validade === null || SOMENTE_DATA(d.validade) >= hoje),
        ),
    );
  }
}
