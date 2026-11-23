import { Injectable } from '@nestjs/common';
import { diaDaSemana, MATRIZ_TURNOS, type ContratoSala, type FiltrosPainel } from '@torres/shared';
import { EscopoDadosService } from '../../../common/auth/escopo-dados.service';
import {
  AgendaOcupacaoService,
  type AgendamentoDaOcupacao,
} from '../../comercial-atendimento/agenda/agenda-ocupacao.service';
import { MinhaEmpresaService } from '../../configuracoes-gestao/minha-empresa/minha-empresa.service';
import { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import { ContratosSalaService } from '../../gestao-profissionais/salas/contratos-sala.service';
import { hojeEmSaoPaulo } from '../../gestao-profissionais/salas/data-local';
import { SalasBloqueiosService } from '../../gestao-profissionais/salas/salas-bloqueios.service';
import { SalasService } from '../../gestao-profissionais/salas/salas.service';
import {
  calcularOcupacao,
  type BloqueioDaOcupacao,
  type ResultadoOcupacao,
} from './calculo-ocupacao';
import { diasDoPeriodo, periodoAnterior } from './periodo-anterior';

/** Todos os dias da semana, para a clínica que ainda não cadastrou o horário de funcionamento. */
const TODOS_OS_DIAS = [0, 1, 2, 3, 4, 5, 6];

export interface OcupacaoPainel {
  atual: ResultadoOcupacao;
  anterior: ResultadoOcupacao;
  periodoAnterior: { de: string; ate: string };
  /** Como o detalhe dos indicadores chama o período de comparação. */
  rotuloAnterior: string;
  /**
   * Previsão linear: a taxa de uso do período até hoje, mantida até o fim. Em período já
   * encerrado vale o realizado; em período futuro, `null`.
   */
  previsao: { taxaUsoBase: ResultadoOcupacao; completo: boolean } | null;
  /** Nome e especialidade dos profissionais das linhas de `atual.porProfissional`. */
  profissionais: Record<string, { nome: string; especialidade: string | null }>;
}

/**
 * Ocupação efetiva do Painel (issue #139): capacidade, contratado, utilizado e vago por sala, dia,
 * turno e profissional. Só lê, e consulta cada módulo dono pelo service exportado.
 *
 * Usuário restrito (#153): vê só as salas em que um profissional seu tem contrato, reserva ou
 * agendamento no período, e a tabela de profissionais traz só os dele.
 */
@Injectable()
export class OcupacaoService {
  constructor(
    private readonly salas: SalasService,
    private readonly contratos: ContratosSalaService,
    private readonly bloqueios: SalasBloqueiosService,
    private readonly agenda: AgendaOcupacaoService,
    private readonly profissionais: ProfissionaisService,
    private readonly minhaEmpresa: MinhaEmpresaService,
    private readonly escopo: EscopoDadosService,
  ) {}

  async calcular(
    filtros: FiltrosPainel,
    periodo: { de: string; ate: string },
    empresaId?: string,
  ): Promise<OcupacaoPainel> {
    if (filtros.profissionalId) this.escopo.garantirProfissional(filtros.profissionalId);
    const anterior = periodoAnterior(periodo.de, periodo.ate, filtros.modo);
    const [diasAbertos, todasAsSalas] = await Promise.all([
      this.diasDeFuncionamento(empresaId),
      this.salas.listarParaMatriz(filtros.salaId),
    ]);
    const salaIds = todasAsSalas.map((s) => s.id);

    // Uma só consulta cobre o período e o anterior.
    const [contratos, bloqueios, agendamentos, ativos] = await Promise.all([
      this.contratos.ativosNoPeriodo(anterior.de, periodo.ate, salaIds),
      this.bloqueios.ocorrenciasNoPeriodo(anterior.de, periodo.ate, salaIds),
      this.agenda.doPeriodo(anterior.de, periodo.ate, salaIds),
      this.profissionais.listarParaAgenda(),
    ]);
    const bloqueiosDoCalculo: BloqueioDaOcupacao[] = bloqueios.map((o) => ({
      salaId: o.bloqueio.salaId,
      tipo: o.bloqueio.tipo,
      profissionalId: o.bloqueio.profissionalId,
      data: o.data,
      inicio: o.inicio,
      fim: o.fim,
    }));

    const salas = this.salasVisiveis(
      todasAsSalas,
      contratos,
      bloqueiosDoCalculo,
      agendamentos,
      periodo,
    );
    const turnos = filtros.turno ? [filtros.turno] : [...MATRIZ_TURNOS];
    const diasValidos = (de: string, ate: string, limite?: string) =>
      diasDoPeriodo(de, limite && limite < ate ? limite : ate).filter(
        (d) =>
          diasAbertos.has(diaDaSemana(d)) &&
          (filtros.diaSemana === undefined || diaDaSemana(d) === filtros.diaSemana),
      );

    const visiveis = ativos.filter(
      (p) =>
        this.escopo.permite(p.id) && (!filtros.profissionalId || p.id === filtros.profissionalId),
    );
    const base = {
      salas,
      turnos,
      contratos,
      bloqueios: bloqueiosDoCalculo,
      agendamentos,
      profissionalIds: visiveis.map((p) => p.id),
      profissionalId: filtros.profissionalId,
    };
    const atual = calcularOcupacao({ ...base, dias: diasValidos(periodo.de, periodo.ate) });
    const anteriorCalculado = calcularOcupacao({
      ...base,
      dias: diasValidos(anterior.de, anterior.ate),
    });

    const hoje = hojeEmSaoPaulo();
    let previsao: OcupacaoPainel['previsao'] = null;
    if (hoje >= periodo.ate) previsao = { taxaUsoBase: atual, completo: true };
    else if (hoje >= periodo.de) {
      previsao = {
        taxaUsoBase: calcularOcupacao({
          ...base,
          dias: diasValidos(periodo.de, periodo.ate, hoje),
        }),
        completo: false,
      };
    }

    const porProfissional = atual.porProfissional.filter(
      (p) =>
        this.escopo.permite(p.profissionalId) &&
        (!filtros.profissionalId || p.profissionalId === filtros.profissionalId),
    );
    atual.porProfissional = porProfissional;
    return {
      atual,
      anterior: anteriorCalculado,
      periodoAnterior: anterior,
      rotuloAnterior: filtros.modo === 'mes' ? 'mês anterior' : 'período anterior',
      previsao,
      profissionais: await this.nomes(
        porProfissional.map((p) => p.profissionalId),
        ativos,
      ),
    };
  }

  /** Dias da semana (0 = domingo) em que a clínica abre; sem horário cadastrado, todos. */
  private async diasDeFuncionamento(empresaId?: string): Promise<ReadonlySet<number>> {
    if (!empresaId) return new Set(TODOS_OS_DIAS);
    const horarios = await this.minhaEmpresa.listarHorarios(empresaId);
    const abertos = horarios.filter((h) => !h.fechado).map((h) => h.diaSemana);
    return new Set(abertos.length > 0 ? abertos : TODOS_OS_DIAS);
  }

  /** Restrito: só as salas com contrato, reserva ou agendamento de um profissional seu. */
  private salasVisiveis(
    salas: ReadonlyArray<{ id: string; nome: string }>,
    contratos: readonly ContratoSala[],
    bloqueios: readonly BloqueioDaOcupacao[],
    agendamentos: readonly AgendamentoDaOcupacao[],
    periodo: { de: string; ate: string },
  ): Array<{ id: string; nome: string }> {
    if (!this.escopo.restrito()) return [...salas];
    const proprias = new Set<string>();
    for (const c of contratos) {
      if (c.locatarioTipo === 'PROFISSIONAL' && this.escopo.permite(c.locatarioId)) {
        proprias.add(c.salaId);
      }
    }
    for (const b of bloqueios) {
      if (b.profissionalId !== null && this.escopo.permite(b.profissionalId))
        proprias.add(b.salaId);
    }
    for (const a of agendamentos) {
      if (a.data >= periodo.de && this.escopo.permite(a.profissionalId)) proprias.add(a.salaId);
    }
    return salas.filter((s) => proprias.has(s.id));
  }

  private async nomes(
    ids: readonly string[],
    ativos: ReadonlyArray<{ id: string; nome: string; especialidade: string | null }>,
  ): Promise<OcupacaoPainel['profissionais']> {
    const porId = new Map(ativos.map((p) => [p.id, p]));
    const faltando = ids.filter((id) => !porId.has(id));
    const nomes = faltando.length > 0 ? await this.profissionais.nomesPorIds(faltando) : new Map();
    return Object.fromEntries(
      ids.map((id) => [
        id,
        {
          nome: porId.get(id)?.nome ?? nomes.get(id) ?? '—',
          especialidade: porId.get(id)?.especialidade ?? null,
        },
      ]),
    );
  }
}
