import { TransactionHost } from '@nestjs-cls/transactional';
import { Injectable } from '@nestjs/common';
import {
  adicionarDias,
  diaDaSemana,
  MATRIZ_HORA_FINAL_PADRAO,
  MATRIZ_HORA_INICIAL_PADRAO,
  MATRIZ_STATUS_PRIORIDADE,
  MATRIZ_TURNO_FAIXAS,
  MATRIZ_TURNOS,
  periodoDaMatriz,
  turnoDoMinuto,
  type AgendaMatriz,
  type AgendaMatrizCelula,
  type AgendaMatrizColuna,
  type AgendaMatrizItem,
  type AgendaMatrizQuery,
  type ContratoSala,
  type MatrizSituacao,
  type MatrizStatus,
  type SalaBloqueioTipo,
} from '@torres/shared';
import { EscopoDadosService } from '../../../common/auth/escopo-dados.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import { intervaloDoPeriodo } from '../../../common/relatorios/periodo';
import { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import { hojeEmSaoPaulo } from '../../gestao-profissionais/salas/data-local';
import { ContratosSalaService } from '../../gestao-profissionais/salas/contratos-sala.service';
import { SalasService } from '../../gestao-profissionais/salas/salas.service';
import { SalasBloqueiosService } from '../../gestao-profissionais/salas/salas-bloqueios.service';
import { dataHoraLocal, horaDeMinutos } from './agenda-tempo';

const DIA_EM_MINUTOS = 24 * 60;

/** "HH:MM" (ou "24:00") em minutos desde as 00:00. */
function minutos(hora: string): number {
  const [h = 0, m = 0] = hora.split(':').map(Number);
  return h * 60 + m;
}

/** O que ocupa a sala num dia, em minutos desde as 00:00 (`fim` exclusivo). */
interface Ocupacao {
  item: AgendaMatrizItem;
  status: MatrizStatus;
  inicio: number;
  fim: number;
  /** Profissional dono (contrato, agendamento ou reserva); `null` = bloqueio da sala inteira. */
  profissionalId: string | null;
  /** Reserva de outro profissional que o restrito não identifica: não é do filtro de profissional. */
  desconhecido: boolean;
}

const GRUPO_DA_SITUACAO: Readonly<Record<MatrizStatus, MatrizSituacao>> = {
  DISPONIVEL: 'DISPONIVEL',
  CONTRATADO: 'CONTRATADO',
  AGENDADO: 'AGENDADO',
  BLOQUEIO: 'BLOQUEADO',
  MANUTENCAO: 'BLOQUEADO',
  RESERVA: 'RESERVADO',
  CORTESIA: 'RESERVADO',
  USO_AVULSO: 'RESERVADO',
};

function statusDoBloqueio(tipo: SalaBloqueioTipo): MatrizStatus {
  return tipo;
}

/**
 * Agenda matricial (issue #137): Sala × Dia × Horário × Profissional. Junta o período contratado
 * (contratos de sala), os agendamentos (#136) e os bloqueios e reservas da sala (#138). Só lê.
 * Cada módulo dono é consultado pelo service exportado, nunca pelas tabelas dele (CLAUDE.md §3).
 */
@Injectable()
export class AgendaMatrizService {
  constructor(
    private readonly txHost: TransactionHost<PrismaAdapter>,
    private readonly salas: SalasService,
    private readonly contratos: ContratosSalaService,
    private readonly bloqueios: SalasBloqueiosService,
    private readonly profissionais: ProfissionaisService,
    private readonly escopo: EscopoDadosService,
  ) {}

  /**
   * Células de cada sala no período. A grade traz **todas** as salas e todos os contratos do
   * período, sem limite de profissionais (falha C2 do DrIntelli). Os filtros de profissional e
   * especialidade escondem o que é de outros; o "disponível" vem sempre da sala inteira.
   *
   * Usuário restrito (#153): vê só as salas em que um profissional seu tem contrato, reserva ou
   * agendamento no período, e o que é de outros profissionais vem `oculto`, sem nome nem valor.
   */
  async matriz(query: AgendaMatrizQuery): Promise<AgendaMatriz> {
    if (query.profissionalId) this.escopo.garantirProfissional(query.profissionalId);
    const { inicio, fim } = periodoDaMatriz(query.visao, query.data ?? hojeEmSaoPaulo());
    const dias = diasEntre(inicio, fim);

    const filtroProfissionais = await this.profissionaisDoFiltro(query);
    const salas = await this.salas.listarParaMatriz(query.salaId);
    const salaIds = salas.map((s) => s.id);
    const ocupacoes = await this.carregar(salaIds, inicio, fim, dias);

    const colunas = this.colunas(query, ocupacoes);
    const visiveis = this.escopo.restrito()
      ? salas.filter((s) =>
          [...ocupacoes.entries()].some(
            ([chave, lista]) =>
              chave.startsWith(`${s.id}|`) &&
              lista.some((o) => o.profissionalId !== null && this.escopo.permite(o.profissionalId)),
          ),
        )
      : salas;

    return {
      visao: query.visao,
      inicio,
      fim,
      dias,
      colunas,
      salas: visiveis.map((sala) => ({
        salaId: sala.id,
        salaNome: sala.nome,
        celulas: dias.flatMap((data) =>
          colunas
            .map((coluna) =>
              this.celula(
                data,
                coluna,
                ocupacoes.get(`${sala.id}|${data}`) ?? [],
                filtroProfissionais,
                query.situacao,
              ),
            )
            .filter((c): c is AgendaMatrizCelula => c !== null),
        ),
      })),
    };
  }

  /** Ids permitidos pelos filtros de profissional e especialidade; `null` = sem filtro. */
  private async profissionaisDoFiltro(
    query: AgendaMatrizQuery,
  ): Promise<ReadonlySet<string> | null> {
    if (!query.profissionalId && !query.especialidadeId) return null;
    let ids: Set<string> | null = null;
    if (query.especialidadeId) {
      ids = new Set(await this.profissionais.idsDaEspecialidade(query.especialidadeId));
    }
    if (query.profissionalId) {
      const so = query.profissionalId;
      ids = ids === null || ids.has(so) ? new Set([so]) : new Set();
    }
    return ids;
  }

  /** Ocupações por `salaId|data`: contratos vigentes, agendamentos não cancelados e bloqueios. */
  private async carregar(
    salaIds: readonly string[],
    inicio: string,
    fim: string,
    dias: readonly string[],
  ): Promise<Map<string, Ocupacao[]>> {
    const mapa = new Map<string, Ocupacao[]>();
    if (salaIds.length === 0) return mapa;
    const adicionar = (salaId: string, data: string, o: Ocupacao) => {
      const chave = `${salaId}|${data}`;
      const lista = mapa.get(chave) ?? [];
      lista.push(o);
      mapa.set(chave, lista);
    };

    const { gte, lt } = intervaloDoPeriodo(inicio, fim);
    const [contratos, bloqueios, agendamentos] = await Promise.all([
      this.contratos.ativosNoPeriodo(inicio, fim, salaIds),
      this.bloqueios.ocorrenciasNoPeriodo(inicio, fim, salaIds),
      this.txHost.tx.agendamento.findMany({
        where: {
          deletedAt: null,
          status: { not: 'CANCELADO' },
          salaId: { in: [...salaIds] },
          inicio: { gte, lt },
        },
        select: {
          id: true,
          salaId: true,
          profissionalId: true,
          inicio: true,
          duracaoMinutos: true,
          status: true,
          profissional: { select: { nome: true } },
        },
        orderBy: [{ inicio: 'asc' }, { numero: 'asc' }],
      }),
    ]);

    for (const contrato of contratos) {
      for (const data of dias) {
        const o = ocupacaoDoContrato(contrato, data);
        if (!o) continue;
        const dono = contrato.locatarioTipo === 'PROFISSIONAL' ? contrato.locatarioId : null;
        const oculto = this.escopo.restrito() && !this.escopo.permite(dono);
        adicionar(contrato.salaId, data, {
          ...o,
          status: 'CONTRATADO',
          profissionalId: dono,
          desconhecido: false,
          item: {
            tipo: 'CONTRATO',
            id: contrato.id,
            inicio: horaDeMinutos(o.inicio),
            fim: horaDeMinutos(o.fim),
            nome: oculto ? null : contrato.locatarioNome,
            valorMensal: oculto ? null : contrato.valorTotalMensal,
            bloqueioTipo: null,
            agendamentoStatus: null,
            oculto,
          },
        });
      }
    }

    for (const ocorrencia of bloqueios) {
      const { bloqueio } = ocorrencia;
      const inicioMin = minutos(ocorrencia.inicio);
      const fimMin = minutos(ocorrencia.fim);
      adicionar(bloqueio.salaId, ocorrencia.data, {
        status: statusDoBloqueio(bloqueio.tipo),
        inicio: inicioMin,
        fim: fimMin,
        profissionalId: bloqueio.profissionalId,
        desconhecido: bloqueio.oculto,
        item: {
          tipo: 'BLOQUEIO',
          id: bloqueio.id,
          inicio: horaDeMinutos(inicioMin),
          fim: horaDeMinutos(fimMin),
          nome: bloqueio.oculto ? null : bloqueio.profissionalNome,
          valorMensal: null,
          bloqueioTipo: bloqueio.tipo,
          agendamentoStatus: null,
          oculto: bloqueio.oculto,
        },
      });
    }

    for (const agendamento of agendamentos) {
      if (!agendamento.salaId) continue;
      const { data, hora } = dataHoraLocal(agendamento.inicio);
      const inicioMin = minutos(hora);
      const fimMin = Math.min(inicioMin + agendamento.duracaoMinutos, DIA_EM_MINUTOS);
      const oculto = this.escopo.restrito() && !this.escopo.permite(agendamento.profissionalId);
      adicionar(agendamento.salaId, data, {
        status: 'AGENDADO',
        inicio: inicioMin,
        fim: fimMin,
        profissionalId: agendamento.profissionalId,
        desconhecido: false,
        item: {
          tipo: 'AGENDAMENTO',
          id: agendamento.id,
          inicio: horaDeMinutos(inicioMin),
          fim: horaDeMinutos(fimMin),
          nome: oculto ? null : agendamento.profissional.nome,
          valorMensal: null,
          bloqueioTipo: null,
          agendamentoStatus: oculto ? null : agendamento.status,
          oculto,
        },
      });
    }
    return mapa;
  }

  /**
   * Colunas da grade: horas cheias na visão Dia (07h às 20h, ampliando para caber o que houver
   * fora) e os três turnos nas demais. O filtro de turno deixa só as colunas dele.
   */
  private colunas(
    query: AgendaMatrizQuery,
    ocupacoes: ReadonlyMap<string, Ocupacao[]>,
  ): AgendaMatrizColuna[] {
    let colunas: AgendaMatrizColuna[];
    if (query.visao === 'dia') {
      const todas = [...ocupacoes.values()].flat();
      const primeira = Math.min(
        MATRIZ_HORA_INICIAL_PADRAO,
        ...todas.map((o) => Math.floor(o.inicio / 60)),
      );
      const ultima = Math.max(MATRIZ_HORA_FINAL_PADRAO, ...todas.map((o) => Math.ceil(o.fim / 60)));
      colunas = [];
      for (let hora = primeira; hora < ultima; hora++) {
        colunas.push({
          chave: horaDeMinutos(hora * 60),
          inicio: horaDeMinutos(hora * 60),
          fim: horaDeMinutos((hora + 1) * 60),
          turno: turnoDoMinuto(hora * 60),
        });
      }
    } else {
      colunas = MATRIZ_TURNOS.map((turno) => ({
        chave: turno,
        inicio: horaDeMinutos(MATRIZ_TURNO_FAIXAS[turno].inicio),
        fim: horaDeMinutos(MATRIZ_TURNO_FAIXAS[turno].fim),
        turno,
      }));
    }
    return query.turno ? colunas.filter((c) => c.turno === query.turno) : colunas;
  }

  /**
   * Célula de uma sala num dia e coluna. `null` quando os filtros a tiram da grade: há algo na
   * sala, mas nada do profissional filtrado, ou a situação não confere.
   */
  private celula(
    data: string,
    coluna: AgendaMatrizColuna,
    ocupacoes: readonly Ocupacao[],
    profissionais: ReadonlySet<string> | null,
    situacao: MatrizSituacao | undefined,
  ): AgendaMatrizCelula | null {
    const de = minutos(coluna.inicio);
    const ate = minutos(coluna.fim);
    const naColuna = ocupacoes.filter((o) => o.inicio < ate && de < o.fim);
    const relevantes = naColuna.filter(
      (o) =>
        profissionais === null ||
        o.profissionalId === null ||
        (!o.desconhecido && profissionais.has(o.profissionalId)),
    );
    if (naColuna.length > 0 && relevantes.length === 0) return null;

    const status =
      MATRIZ_STATUS_PRIORIDADE.find((s) => relevantes.some((o) => o.status === s)) ?? 'DISPONIVEL';
    const temContrato = relevantes.some((o) => o.status === 'CONTRATADO');
    const semUso = temContrato && !naColuna.some((o) => o.status === 'AGENDADO');
    if (situacao && !this.confere(situacao, status, temContrato, semUso)) return null;
    return {
      data,
      coluna: coluna.chave,
      status,
      semUso,
      itens: relevantes
        .map((o) => o.item)
        .sort((a, b) => a.inicio.localeCompare(b.inicio) || a.tipo.localeCompare(b.tipo)),
    };
  }

  private confere(
    situacao: MatrizSituacao,
    status: MatrizStatus,
    temContrato: boolean,
    semUso: boolean,
  ): boolean {
    if (situacao === 'CONTRATADO') return temContrato;
    if (situacao === 'SEM_USO') return semUso;
    return GRUPO_DA_SITUACAO[status] === situacao;
  }
}

/** Dias de `inicio` a `fim`, inclusive. */
function diasEntre(inicio: string, fim: string): string[] {
  const dias: string[] = [];
  for (let d = inicio; d <= fim; d = adicionarDias(d, 1)) dias.push(d);
  return dias;
}

/** Faixa do contrato no dia, se ele estiver vigente e tiver o dia da semana. */
function ocupacaoDoContrato(
  contrato: ContratoSala,
  data: string,
): { inicio: number; fim: number } | null {
  const vigente =
    data >= contrato.dataInicio && (contrato.dataFim === null || data <= contrato.dataFim);
  const dia = contrato.dias.find((d) => d.diaSemana === diaDaSemana(data));
  if (!vigente || !dia) return null;
  return { inicio: minutos(dia.inicio), fim: minutos(dia.fim) };
}
