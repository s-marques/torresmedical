import type { ContratoModalidade } from '@torres/shared';
import {
  dataVencimentoDoMes,
  limitesCompetencia,
} from '../../gestao-profissionais/salas/competencia-cobranca';

/** Quantos meses (de calendário) o período da provisão pode ter, para não projetar sem fim. */
export const MAX_MESES_PROVISAO = 24;

export const SEM_PROFISSIONAL = 'Sem profissional';

export type OrigemProvisao = 'Gerado' | 'Projetado';

export const STATUS_PROJETADO = 'Projetado';

/** Uma parcela esperada: título já gerado em Contas a Receber ou projeção de contrato ativo. */
export interface LinhaProvisao {
  origem: OrigemProvisao;
  /** `AAAA-MM` do vencimento. */
  mes: string;
  vencimento: Date;
  /** Número do contrato de sala. */
  contrato: number | null;
  locatario: string;
  profissional: string;
  sala: string;
  modalidade: ContratoModalidade | null;
  valor: number;
  status: string;
}

/** Só o que a projeção lê do contrato (subconjunto do DTO de contrato de sala). */
export interface ContratoProjetavel {
  id: string;
  numero: number;
  modalidade: ContratoModalidade;
  permuta: boolean;
  valorUnitario: number;
  diaVencimento: number;
  dataInicio: string;
  dataFim: string | null;
  salaNome: string;
  locatarioTipo: 'PROFISSIONAL' | 'CLIENTE';
  locatarioNome: string;
}

const diaUtc = (data: string): Date => new Date(`${data}T00:00:00Z`);

/** Meses (`AAAA-MM`) de calendário de `de` a `ate` (`AAAA-MM-DD`), inclusive. */
export function mesesDoPeriodo(de: string, ate: string): string[] {
  const meses: string[] = [];
  let [ano = 0, mes = 1] = de.slice(0, 7).split('-').map(Number);
  const ultimo = ate.slice(0, 7);
  for (;;) {
    const atual = `${ano}-${String(mes).padStart(2, '0')}`;
    if (atual > ultimo) break;
    meses.push(atual);
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return meses;
}

/**
 * Valor projetado de um contrato numa competência. Hoje é o valor mensal do contrato; o reajuste
 * previsto (issue #168) entra aqui quando existir.
 */
export function valorProjetado(contrato: ContratoProjetavel, _competencia: string): number {
  return contrato.valorUnitario;
}

/** O contrato está vigente em algum dia do mês (mesma regra do "Gerar Cobranças do Mês"). */
function vigenteNoMes(contrato: ContratoProjetavel, competencia: string): boolean {
  const { de, ate } = limitesCompetencia(competencia);
  return contrato.dataInicio <= ate && (contrato.dataFim === null || contrato.dataFim >= de);
}

export interface OpcoesProjecao {
  periodo: { de: string; ate: string };
  /** Primeira competência (`AAAA-MM`) que pode ser projetada: o mês atual. Antes dele não há "futuro". */
  aPartirDe: string;
  /** Competências do contrato que já têm cobrança, "sem cobrança" ou título: `<contratoId>|<AAAA-MM>`. */
  cobertas: ReadonlySet<string>;
}

export const chaveCompetencia = (contratoId: string, competencia: string): string =>
  `${contratoId}|${competencia}`;

/**
 * Projeta as parcelas dos contratos Mensais ativos, sem permuta, nas competências do período
 * que ainda não têm título nem confirmação de "sem cobrança". Turno e Hora Avulsa dependem do uso
 * e não são projetados.
 */
export function projetarContratos(
  contratos: readonly ContratoProjetavel[],
  { periodo, aPartirDe, cobertas }: OpcoesProjecao,
): LinhaProvisao[] {
  const meses = mesesDoPeriodo(periodo.de, periodo.ate).filter((m) => m >= aPartirDe);
  const linhas: LinhaProvisao[] = [];
  for (const contrato of contratos) {
    if (contrato.permuta || contrato.modalidade !== 'MENSAL') continue;
    for (const competencia of meses) {
      if (!vigenteNoMes(contrato, competencia)) continue;
      if (cobertas.has(chaveCompetencia(contrato.id, competencia))) continue;
      const vencimento = dataVencimentoDoMes(competencia, contrato.diaVencimento);
      if (vencimento < periodo.de || vencimento > periodo.ate) continue;
      linhas.push({
        origem: 'Projetado',
        mes: competencia,
        vencimento: diaUtc(vencimento),
        contrato: contrato.numero,
        locatario: contrato.locatarioNome,
        profissional:
          contrato.locatarioTipo === 'PROFISSIONAL' ? contrato.locatarioNome : SEM_PROFISSIONAL,
        sala: contrato.salaNome,
        modalidade: contrato.modalidade,
        valor: valorProjetado(contrato, competencia),
        status: STATUS_PROJETADO,
      });
    }
  }
  return linhas;
}

export type AgruparProvisao = 'mes' | 'profissional' | 'sala' | 'modalidade' | 'status';

export interface LinhaProvisaoAgrupada {
  grupo: string;
  gerado: number;
  projetado: number;
  total: number;
}

const arredondar = (valor: number): number => Math.round(valor * 100) / 100;

/** Soma gerado e projetado por mês, profissional, sala, modalidade ou status. */
export function agruparProvisao(
  linhas: readonly LinhaProvisao[],
  agrupar: AgruparProvisao,
  rotuloModalidade: (modalidade: ContratoModalidade) => string,
): LinhaProvisaoAgrupada[] {
  const chave = (l: LinhaProvisao): string => {
    if (agrupar === 'mes') return l.mes;
    if (agrupar === 'profissional') return l.profissional;
    if (agrupar === 'sala') return l.sala;
    if (agrupar === 'status') return l.status;
    return l.modalidade ? rotuloModalidade(l.modalidade) : '—';
  };
  const grupos = new Map<string, LinhaProvisaoAgrupada>();
  for (const l of linhas) {
    const g = grupos.get(chave(l)) ?? { grupo: chave(l), gerado: 0, projetado: 0, total: 0 };
    if (l.origem === 'Gerado') g.gerado += l.valor;
    else g.projetado += l.valor;
    g.total += l.valor;
    grupos.set(g.grupo, g);
  }
  return [...grupos.values()].map((g) => ({
    grupo: g.grupo,
    gerado: arredondar(g.gerado),
    projetado: arredondar(g.projetado),
    total: arredondar(g.total),
  }));
}
