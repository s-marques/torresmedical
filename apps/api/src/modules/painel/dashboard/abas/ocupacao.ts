import type { MatrizTurno } from '@torres/shared';
import { percentual, type Contagem } from '../../../../common/ocupacao/calculo-ocupacao';
import type { OcupacaoPainel } from '../../ocupacao/ocupacao.service';
import {
  coluna,
  kpi,
  secao,
  tabela,
  TODOS_OS_GRAFICOS,
  type ConstrutorAba,
  type DadosPainel,
} from '../blocos';

const DIAS_DA_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const ROTULO_TURNO: Record<MatrizTurno, string> = {
  MANHA: 'Manhã',
  TARDE: 'Tarde',
  NOITE: 'Noite',
};
const LIMITE_RANKING = 10;

const NUMERO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** `2026-10-22` → `22/10`. */
function diaMes(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

function hora(h: number): string {
  return `${String(h).padStart(2, '0')}h`;
}

function taxaUso(c: Contagem): number | null {
  return percentual(c.utilizados, c.capacidade);
}

/** "mês anterior: 42,5%" para o detalhe do indicador; sem base de cálculo, "mês anterior: —". */
function comparacao(rotulo: string, valor: number | null, sufixo = ''): string {
  return `${rotulo}: ${valor === null ? '—' : `${NUMERO.format(valor)}${sufixo}`}`;
}

function previsao(o: OcupacaoPainel): { valor: number | null; detalhe: string } {
  if (o.previsao === null) return { valor: null, detalhe: 'período ainda não começou' };
  const valor = taxaUso(o.previsao.taxaUsoBase.total);
  return {
    valor,
    detalhe: o.previsao.completo
      ? 'período encerrado (realizado)'
      : 'projeção linear até o fim do período',
  };
}

function secaoIndicadores(o: OcupacaoPainel) {
  const { total } = o.atual;
  const antes = o.anterior.total;
  const rotulo = o.rotuloAnterior;
  const previsto = previsao(o);
  return secao('indicadores', null, [
    kpi(
      'total-periodos',
      'Capacidade (períodos)',
      'inteiro',
      total.capacidade,
      comparacao(rotulo, antes.capacidade),
    ),
    kpi(
      'contratados',
      'Contratados',
      'inteiro',
      total.contratados,
      comparacao(rotulo, antes.contratados),
    ),
    kpi(
      'utilizados',
      'Utilizados',
      'inteiro',
      total.utilizados,
      comparacao(rotulo, antes.utilizados),
    ),
    kpi(
      'contratado-sem-uso',
      'Contratado sem uso',
      'inteiro',
      total.contratadosSemUso,
      comparacao(rotulo, antes.contratadosSemUso),
    ),
    kpi(
      'taxa-uso',
      'Taxa de Uso',
      'percentual',
      taxaUso(total),
      comparacao(rotulo, taxaUso(antes), '%'),
    ),
    kpi(
      'taxa-contratacao',
      'Taxa de Contratação',
      'percentual',
      percentual(total.contratados, total.capacidade),
      comparacao(rotulo, percentual(antes.contratados, antes.capacidade), '%'),
    ),
    kpi(
      'vacancia',
      'Vacância',
      'percentual',
      percentual(total.vagos, total.capacidade),
      comparacao(rotulo, percentual(antes.vagos, antes.capacidade), '%'),
    ),
    kpi('previsao-uso', 'Previsão de Uso', 'percentual', previsto.valor, previsto.detalhe),
  ]);
}

function secaoGraficos(o: OcupacaoPainel) {
  const { atual } = o;
  const porEspecialidade = new Map<string, { contratados: number; utilizados: number }>();
  for (const p of atual.porProfissional) {
    const nome = o.profissionais[p.profissionalId]?.especialidade ?? 'Sem especialidade';
    const linha = porEspecialidade.get(nome) ?? { contratados: 0, utilizados: 0 };
    linha.contratados += p.contratados;
    linha.utilizados += p.utilizados;
    porEspecialidade.set(nome, linha);
  }

  return secao('graficos', null, [
    tabela(
      'periodos-ocupados-por-dia',
      'Períodos Ocupados por Dia',
      [
        coluna('dia', 'Dia'),
        coluna('manha', 'Manhã', 'inteiro'),
        coluna('tarde', 'Tarde', 'inteiro'),
        coluna('noite', 'Noite', 'inteiro'),
        coluna('vagos', 'Vagos', 'inteiro'),
      ],
      {
        graficos: ['barras', 'linha'],
        padrao: 'barras',
        linhas: atual.porDia.map((d) => ({
          dia: diaMes(d.data),
          manha: d.ocupadosPorTurno.MANHA,
          tarde: d.ocupadosPorTurno.TARDE,
          noite: d.ocupadosPorTurno.NOITE,
          vagos: d.vagos,
        })),
      },
    ),
    tabela(
      'ocupacao-por-turno',
      'Ocupação por Turno',
      [
        coluna('turno', 'Turno'),
        coluna('capacidade', 'Capacidade', 'inteiro'),
        coluna('contratados', 'Contratados', 'inteiro'),
        coluna('utilizados', 'Utilizados', 'inteiro'),
        coluna('vagos', 'Vagos', 'inteiro'),
        coluna('uso', 'Uso %', 'percentual'),
      ],
      {
        graficos: TODOS_OS_GRAFICOS,
        largura: 'meia',
        linhas: atual.porTurno.map((t) => ({
          turno: ROTULO_TURNO[t.turno],
          capacidade: t.capacidade,
          contratados: t.contratados,
          utilizados: t.utilizados,
          vagos: t.vagos,
          uso: taxaUso(t),
        })),
      },
    ),
    tabela(
      'ranking-ocupacao-por-sala',
      'Ranking — Ocupação por Sala',
      [
        coluna('sala', 'Sala'),
        coluna('contratados', 'Contratados', 'inteiro'),
        coluna('utilizados', 'Utilizados', 'inteiro'),
        coluna('vagos', 'Vagos', 'inteiro'),
        coluna('uso', 'Uso %', 'percentual'),
      ],
      {
        graficos: TODOS_OS_GRAFICOS,
        largura: 'meia',
        // Todas as salas aparecem, inclusive as sem uso (0%).
        linhas: [...atual.porSala]
          .sort((a, b) => (taxaUso(b) ?? -1) - (taxaUso(a) ?? -1) || a.sala.localeCompare(b.sala))
          .map((s) => ({
            sala: s.sala,
            contratados: s.contratados,
            utilizados: s.utilizados,
            vagos: s.vagos,
            uso: taxaUso(s),
          })),
      },
    ),
    tabela(
      'ocupacao-por-especialidade',
      'Ocupação por Especialidade',
      [
        coluna('especialidade', 'Especialidade'),
        coluna('contratados', 'Contratados', 'inteiro'),
        coluna('utilizados', 'Utilizados', 'inteiro'),
      ],
      {
        graficos: TODOS_OS_GRAFICOS,
        largura: 'meia',
        linhas: [...porEspecialidade.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([especialidade, v]) => ({ especialidade, ...v })),
      },
    ),
    tabela(
      'ocupacao-por-profissional',
      'Ocupação por Profissional',
      [
        coluna('profissional', 'Profissional'),
        coluna('especialidade', 'Especialidade'),
        coluna('contratados', 'Contratados', 'inteiro'),
        coluna('utilizados', 'Utilizados', 'inteiro'),
        coluna('uso', 'Uso do contratado %', 'percentual'),
      ],
      {
        graficos: TODOS_OS_GRAFICOS,
        // Todos os profissionais aparecem; contrato sem atendimento sai com 0% de uso.
        linhas: [...atual.porProfissional]
          .sort((a, b) =>
            (o.profissionais[a.profissionalId]?.nome ?? '').localeCompare(
              o.profissionais[b.profissionalId]?.nome ?? '',
            ),
          )
          .map((p) => ({
            profissional: o.profissionais[p.profissionalId]?.nome ?? '—',
            especialidade: o.profissionais[p.profissionalId]?.especialidade ?? null,
            contratados: p.contratados,
            utilizados: p.utilizados,
            uso: p.taxaUso,
          })),
      },
    ),
    tabela(
      'horarios-de-maior-demanda',
      'Horários de Maior Demanda',
      [
        coluna('hora', 'Hora'),
        coluna('agendamentos', 'Agendamentos', 'inteiro'),
        coluna('atendidos', 'Atendidos', 'inteiro'),
      ],
      {
        graficos: ['barras', 'linha'],
        largura: 'meia',
        linhas: atual.demandaPorHora.slice(0, LIMITE_RANKING).map((h) => ({
          hora: hora(h.hora),
          agendamentos: h.agendamentos,
          atendidos: h.utilizados,
        })),
      },
    ),
    tabela(
      'horarios-ociosos',
      'Horários Ociosos',
      [
        coluna('horario', 'Dia e turno'),
        coluna('vagos', 'Períodos vagos', 'inteiro'),
        coluna('capacidade', 'Capacidade', 'inteiro'),
        coluna('vacancia', 'Vacância %', 'percentual'),
      ],
      {
        largura: 'meia',
        linhas: atual.ociosos
          .filter((i) => i.vagos > 0)
          .slice(0, LIMITE_RANKING)
          .map((i) => ({
            horario: `${DIAS_DA_SEMANA[i.diaSemana]} · ${ROTULO_TURNO[i.turno]}`,
            vagos: i.vagos,
            capacidade: i.capacidade,
            vacancia: percentual(i.vagos, i.capacidade),
          })),
      },
    ),
  ]);
}

/**
 * Aba Ocupação (issue #139): capacidade, contratado, utilizado e vago por sala, dia, turno e
 * profissional, com comparação com o mês anterior e previsão linear. Sem os dados (aba não
 * carregada), cai nos indicadores sem valor.
 */
export const abaOcupacao: ConstrutorAba = (dados: DadosPainel) => {
  if (!dados.ocupacao) return [];
  return [secaoIndicadores(dados.ocupacao), secaoGraficos(dados.ocupacao)];
};
