import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  situacaoProximaAcao,
  type AtividadeNegocio,
  type AtividadeNegocioInput,
  type ColunaQuadro,
  type MarcoEstagio,
  type MoverNegocioInput,
  type Negocio,
  type NegocioInput,
  type PerderNegocioInput,
  type Quadro,
  type QuadroQuery,
  type Responsavel,
} from '@torres/shared';
import { Prisma } from '../../../generated/prisma/client';
import type { EstagioPipeline } from '../../../generated/prisma/client';
import { isUuid } from '../../../common/auth/tokens';
import { BusinessException } from '../../../common/errors/api.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { inicioDoDia } from '../../../common/relatorios/periodo';
import { UsuariosService } from '../../configuracoes-gestao/usuarios/usuarios.service';
import { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import { OrigensClienteService } from '../origens-cliente/origens-cliente.service';
import { PacientesService } from '../pacientes/pacientes.service';
import { CrmConfigService } from './crm-config.service';

const NAO_EXCLUIDOS = { deletedAt: null } as const;
const MINUTO_MS = 60_000;

const INCLUDE = {
  origemCliente: { select: { nome: true } },
  motivoPerda: { select: { nome: true } },
  atividades: {
    where: { status: 'PENDENTE', deletedAt: null },
    orderBy: [{ dataHora: 'asc' }, { id: 'asc' }],
    take: 1,
  },
} satisfies Prisma.NegocioInclude;
type NegocioCompleto = Prisma.NegocioGetPayload<{ include: typeof INCLUDE }>;
type AtividadeRow = Prisma.AtividadeNegocioGetPayload<object>;

/** Coluna do negócio onde fica a data de cada marco do dashboard. */
const COLUNA_MARCO = {
  PRIMEIRO_CONTATO: 'marcoPrimeiroContatoEm',
  VISITA: 'marcoVisitaEm',
  PROPOSTA: 'marcoPropostaEm',
  CONTRATO: 'marcoContratoEm',
} as const satisfies Record<MarcoEstagio, keyof Prisma.NegocioUncheckedCreateInput>;

/** Nomes resolvidos fora do model (contatos e responsáveis são de outros módulos, sem FK). */
interface Nomes {
  pacientes: ReadonlyMap<string, string>;
  profissionais: ReadonlyMap<string, string>;
  usuarios: ReadonlyMap<string, string>;
}

/** Instante da atividade a partir do dia e da hora ("HH:MM") no fuso da clínica. */
export function instanteDaAtividade(data: string, hora: string): Date {
  const [h = 0, m = 0] = hora.split(':').map(Number);
  return new Date(inicioDoDia(data).getTime() + (h * 60 + m) * MINUTO_MS);
}

const deData = (valor: Date | null): string | null => valor?.toISOString().slice(0, 10) ?? null;
const paraData = (valor: string | null): Date | null =>
  valor ? new Date(`${valor}T00:00:00Z`) : null;

function toAtividade(a: AtividadeRow, nomes: Nomes): AtividadeNegocio {
  return {
    id: a.id,
    negocioId: a.negocioId,
    tipo: a.tipo,
    titulo: a.titulo,
    dataHora: a.dataHora.toISOString(),
    responsavelId: a.responsavelId,
    responsavel: a.responsavelId ? (nomes.usuarios.get(a.responsavelId) ?? null) : null,
    status: a.status,
  };
}

function marcosDe(n: NegocioCompleto): Negocio['marcos'] {
  const marcos: Negocio['marcos'] = {};
  for (const [marco, coluna] of Object.entries(COLUNA_MARCO) as [MarcoEstagio, keyof typeof n][]) {
    const valor = n[coluna];
    if (valor instanceof Date) marcos[marco] = valor.toISOString();
  }
  return marcos;
}

export function toNegocio(n: NegocioCompleto, nomes: Nomes, agora = new Date()): Negocio {
  const proxima = n.atividades[0] ? toAtividade(n.atividades[0], nomes) : null;
  let contato: string | null = null;
  if (n.contatoId && n.contatoTipo === 'PACIENTE')
    contato = nomes.pacientes.get(n.contatoId) ?? null;
  if (n.contatoId && n.contatoTipo === 'PROFISSIONAL') {
    contato = nomes.profissionais.get(n.contatoId) ?? null;
  }
  return {
    id: n.id,
    pipelineId: n.pipelineId,
    estagioId: n.estagioId,
    titulo: n.titulo,
    valor: n.valor?.toString() ?? null,
    contatoTipo: n.contatoTipo,
    contatoId: n.contatoId,
    contato,
    responsavelId: n.responsavelId,
    responsavel: n.responsavelId ? (nomes.usuarios.get(n.responsavelId) ?? null) : null,
    previsaoFechamento: deData(n.previsaoFechamento),
    origemClienteId: n.origemClienteId,
    origem: n.origemCliente?.nome ?? null,
    status: n.status,
    motivoPerdaId: n.motivoPerdaId,
    motivoPerda: n.motivoPerda?.nome ?? null,
    fechadoEm: n.fechadoEm?.toISOString() ?? null,
    marcos: marcosDe(n),
    proximaAtividade: proxima,
    situacaoAcao: n.status === 'ABERTO' ? situacaoProximaAcao(proxima, agora) : null,
    createdAt: n.createdAt.toISOString(),
  };
}

const somar = (valores: readonly (Prisma.Decimal | null)[]): string =>
  valores
    .reduce<Prisma.Decimal>((total, v) => (v ? total.plus(v) : total), new Prisma.Decimal(0))
    .toFixed(2);

/** Negócios do CRM: quadro do Pipeline (`/crm`), Novo Negócio, mover, ganho/perdido e follow-up. */
@Injectable()
export class NegociosService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly config: CrmConfigService,
    private readonly pacientes: PacientesService,
    private readonly profissionais: ProfissionaisService,
    private readonly usuarios: UsuariosService,
    private readonly origens: OrigensClienteService,
  ) {}

  /** Colunas do pipeline com os negócios abertos (filtrados pela busca) e o resumo por status. */
  async quadro(query: QuadroQuery): Promise<Quadro> {
    const pipeline = await this.config.findPipeline(query.pipelineId);
    const busca = await this.whereBusca(query.search);
    const abertos = await this.txHost.tx.negocio.findMany({
      where: { pipelineId: pipeline.id, status: 'ABERTO', ...NAO_EXCLUIDOS, ...busca },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      include: INCLUDE,
    });
    const nomes = await this.nomes(abertos);
    const agora = new Date();

    const colunas = pipeline.estagios.map((e): ColunaQuadro => {
      const daColuna = abertos.filter((n) => n.estagioId === e.id);
      return {
        estagioId: e.id,
        nome: e.nome,
        cor: e.cor,
        quantidade: daColuna.length,
        total: somar(daColuna.map((n) => n.valor)),
        negocios: daColuna.map((n) => toNegocio(n, nomes, agora)),
      };
    });

    const grupos = await this.txHost.tx.negocio.groupBy({
      by: ['status'],
      where: { pipelineId: pipeline.id, ...NAO_EXCLUIDOS },
      _count: { _all: true },
      _sum: { valor: true },
    });
    const resumoDe = (status: 'ABERTO' | 'GANHO' | 'PERDIDO') => {
      const grupo = grupos.find((g) => g.status === status);
      return {
        quantidade: grupo?._count._all ?? 0,
        total: (grupo?._sum.valor ?? new Prisma.Decimal(0)).toFixed(2),
      };
    };

    return {
      pipelineId: pipeline.id,
      colunas,
      resumo: {
        abertos: resumoDe('ABERTO'),
        ganhos: resumoDe('GANHO'),
        perdidos: resumoDe('PERDIDO'),
      },
    };
  }

  async findById(id: string): Promise<Negocio> {
    return this.toDto(await this.buscar(id));
  }

  /** Modal "Novo Negócio": o pipeline vem do estágio escolhido. */
  async create(input: NegocioInput): Promise<Negocio> {
    const estagio = await this.config.buscarEstagio(input.estagioId);
    await this.validarReferencias(input);
    const agora = new Date();
    const criado = await this.txHost.tx.negocio.create({
      data: {
        ...this.dados(input),
        pipelineId: estagio.pipelineId,
        estagioId: estagio.id,
        ...this.marcoAoEntrar(estagio, null, agora),
      },
      include: INCLUDE,
    });
    return this.toDto(criado);
  }

  /** "Editar": o estágio pode mudar, mas só para outro do mesmo pipeline. */
  async update(id: string, input: NegocioInput): Promise<Negocio> {
    const atual = await this.buscar(id);
    const estagio = await this.estagioDoPipeline(input.estagioId, atual.pipelineId);
    await this.validarReferencias(input);
    const alterado = await this.txHost.tx.negocio.update({
      where: { id },
      data: {
        ...this.dados(input),
        estagioId: estagio.id,
        ...this.marcoAoEntrar(estagio, atual, new Date()),
      },
      include: INCLUDE,
    });
    return this.toDto(alterado);
  }

  /** "Mover → <estágio>" e arrastar o cartão: só negócio aberto, dentro do mesmo pipeline. */
  async mover(id: string, { estagioId }: MoverNegocioInput): Promise<Negocio> {
    const atual = await this.buscarAberto(id);
    const estagio = await this.estagioDoPipeline(estagioId, atual.pipelineId);
    const movido = await this.txHost.tx.negocio.update({
      where: { id },
      data: { estagioId: estagio.id, ...this.marcoAoEntrar(estagio, atual, new Date()) },
      include: INCLUDE,
    });
    return this.toDto(movido);
  }

  /** "Ganho": sai do quadro e entra no total de ganhos. */
  async ganhar(id: string): Promise<Negocio> {
    await this.buscarAberto(id);
    const ganho = await this.txHost.tx.negocio.update({
      where: { id },
      data: { status: 'GANHO', fechadoEm: new Date(), motivoPerdaId: null },
      include: INCLUDE,
    });
    return this.toDto(ganho);
  }

  /** "Perdido": exige o motivo de perda; sai do quadro e entra no total de perdidos. */
  async perder(id: string, input: PerderNegocioInput): Promise<Negocio> {
    await this.buscarAberto(id);
    await this.config.buscarMotivoPerda(input.motivoPerdaId);
    const perdido = await this.txHost.tx.negocio.update({
      where: { id },
      data: { status: 'PERDIDO', fechadoEm: new Date(), motivoPerdaId: input.motivoPerdaId },
      include: INCLUDE,
    });
    return this.toDto(perdido);
  }

  /** Exclusão lógica: histórico comercial. */
  async remove(id: string): Promise<Negocio> {
    await this.buscar(id);
    const excluido = await this.txHost.tx.negocio.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: INCLUDE,
    });
    return this.toDto(excluido);
  }

  /** "Agendar Follow-up": nova próxima ação. Sem responsável, herda o do negócio. */
  async agendarAtividade(
    negocioId: string,
    input: AtividadeNegocioInput,
  ): Promise<AtividadeNegocio> {
    const negocio = await this.buscarAberto(negocioId);
    if (input.responsavelId) await this.usuarios.garantirAtivo(input.responsavelId, 'Responsável');
    const criada = await this.txHost.tx.atividadeNegocio.create({
      data: {
        negocioId,
        tipo: input.tipo,
        titulo: input.titulo,
        dataHora: instanteDaAtividade(input.data, input.hora),
        responsavelId: input.responsavelId ?? negocio.responsavelId,
      },
    });
    return this.toAtividadeDto(criada);
  }

  /** Conclui a próxima ação (o cartão deixa de aparecer atrasado). */
  async concluirAtividade(id: string): Promise<AtividadeNegocio> {
    const atividade = isUuid(id)
      ? await this.txHost.tx.atividadeNegocio.findFirst({ where: { id, ...NAO_EXCLUIDOS } })
      : null;
    if (!atividade) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Atividade não encontrada', { status: 404 });
    }
    if (atividade.status === 'CONCLUIDA') {
      throw new BusinessException('ATIVIDADE_JA_CONCLUIDA', 'A atividade já foi concluída.');
    }
    const concluida = await this.txHost.tx.atividadeNegocio.update({
      where: { id },
      data: { status: 'CONCLUIDA', concluidaEm: new Date() },
    });
    return this.toAtividadeDto(concluida);
  }

  /** Combobox "Responsavel": usuários ativos. */
  responsaveis(): Promise<Responsavel[]> {
    return this.usuarios.responsaveis();
  }

  // ---------- Apoio ----------

  private async buscar(id: string): Promise<NegocioCompleto> {
    const negocio = isUuid(id)
      ? await this.txHost.tx.negocio.findFirst({
          where: { id, ...NAO_EXCLUIDOS },
          include: INCLUDE,
        })
      : null;
    if (!negocio) {
      throw new BusinessException(ErrorCode.NOT_FOUND, 'Negócio não encontrado', { status: 404 });
    }
    return negocio;
  }

  private async buscarAberto(id: string): Promise<NegocioCompleto> {
    const negocio = await this.buscar(id);
    if (negocio.status !== 'ABERTO') {
      throw new BusinessException(
        'NEGOCIO_FECHADO',
        `O negócio já foi marcado como ${negocio.status === 'GANHO' ? 'ganho' : 'perdido'}.`,
      );
    }
    return negocio;
  }

  private async estagioDoPipeline(estagioId: string, pipelineId: string): Promise<EstagioPipeline> {
    const estagio = await this.config.buscarEstagio(estagioId);
    if (estagio.pipelineId !== pipelineId) {
      throw new BusinessException(
        'ESTAGIO_DE_OUTRO_PIPELINE',
        'O estágio escolhido é de outro pipeline.',
      );
    }
    return estagio;
  }

  /** Grava a data do marco na primeira entrada num estágio com marco. */
  private marcoAoEntrar(
    estagio: EstagioPipeline,
    atual: NegocioCompleto | null,
    agora: Date,
  ): Partial<Record<(typeof COLUNA_MARCO)[MarcoEstagio], Date>> {
    if (!estagio.marco) return {};
    const coluna = COLUNA_MARCO[estagio.marco];
    return atual?.[coluna] ? {} : { [coluna]: agora };
  }

  private dados(input: NegocioInput) {
    return {
      titulo: input.titulo,
      valor: input.valor,
      contatoTipo: input.contatoId ? input.contatoTipo : null,
      contatoId: input.contatoId,
      responsavelId: input.responsavelId,
      previsaoFechamento: paraData(input.previsaoFechamento),
      origemClienteId: input.origemClienteId,
    };
  }

  private async validarReferencias(input: NegocioInput): Promise<void> {
    if (input.contatoId && input.contatoTipo === 'PACIENTE') {
      await this.pacientes.findById(input.contatoId);
    }
    if (input.contatoId && input.contatoTipo === 'PROFISSIONAL') {
      await this.profissionais.garantirExiste(input.contatoId);
    }
    if (input.responsavelId) await this.usuarios.garantirAtivo(input.responsavelId, 'Responsável');
    if (input.origemClienteId) await this.origens.findById(input.origemClienteId);
  }

  /** "Buscar cliente (nome, tel, CPF, CNPJ)": título do negócio ou contato (paciente/profissional). */
  private async whereBusca(search: string | undefined): Promise<Prisma.NegocioWhereInput> {
    if (!search) return {};
    const [pacientes, profissionais] = await Promise.all([
      this.pacientes.idsPorBusca(search),
      this.profissionais.idsPorBusca(search),
    ]);
    return {
      OR: [
        { titulo: { contains: search, mode: 'insensitive' } },
        ...(pacientes.length > 0
          ? [{ contatoTipo: 'PACIENTE' as const, contatoId: { in: pacientes } }]
          : []),
        ...(profissionais.length > 0
          ? [{ contatoTipo: 'PROFISSIONAL' as const, contatoId: { in: profissionais } }]
          : []),
      ],
    };
  }

  private async nomes(negocios: readonly NegocioCompleto[]): Promise<Nomes> {
    const ids = (tipo: 'PACIENTE' | 'PROFISSIONAL') =>
      negocios.flatMap((n) => (n.contatoTipo === tipo && n.contatoId ? [n.contatoId] : []));
    const usuarios = negocios.flatMap((n) => [
      ...(n.responsavelId ? [n.responsavelId] : []),
      ...n.atividades.flatMap((a) => (a.responsavelId ? [a.responsavelId] : [])),
    ]);
    const [pacientes, profissionais, nomesUsuarios] = await Promise.all([
      this.pacientes.nomesPorIds(ids('PACIENTE')),
      this.profissionais.nomesPorIds(ids('PROFISSIONAL')),
      this.usuarios.nomesPorIds(usuarios),
    ]);
    return { pacientes, profissionais, usuarios: nomesUsuarios };
  }

  private async toDto(negocio: NegocioCompleto): Promise<Negocio> {
    return toNegocio(negocio, await this.nomes([negocio]));
  }

  private async toAtividadeDto(atividade: AtividadeRow): Promise<AtividadeNegocio> {
    const usuarios = await this.usuarios.nomesPorIds(
      atividade.responsavelId ? [atividade.responsavelId] : [],
    );
    return toAtividade(atividade, { pacientes: new Map(), profissionais: new Map(), usuarios });
  }
}
