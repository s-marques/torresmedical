import {
  CLASSIFICACAO_NOVO_DIAS,
  CLASSIFICACAO_RISCO_TAXA_MAXIMA,
  type ClassificacaoMotivo,
  type ClassificacaoParametros,
  type ClassificacaoParceiro,
} from '@torres/shared';

/**
 * Regras da classificação automática do parceiro (issue #143). Função pura: o service busca os
 * dados nos módulos donos e entrega aqui. As regras estão descritas em `@torres/shared`
 * (`profissional-classificacao.ts`); a precedência é Inativo, Estratégico, Novo, Em risco,
 * Em expansão e Ativo.
 */
export interface EntradaClassificacao {
  /** Hoje no fuso da clínica (`AAAA-MM-DD`). */
  hoje: string;
  profissionalAtivo: boolean;
  /** Marcado manualmente pela gerência. */
  estrategico: boolean;
  /** Tem contrato de sala ativo e vigente hoje. */
  contratoAtivo: boolean;
  /** Assinatura (ou início) do contrato mais antigo; `null` sem contrato. */
  inicioRelacionamento: string | null;
  /** Últimos 30 dias: períodos contratados. */
  contratados: number;
  /** Últimos 30 dias: períodos contratados em que ele atendeu. */
  contratadosUsados: number;
  /** Últimos 30 dias: períodos em que ele atendeu, contratados ou não. */
  utilizados: number;
  /** Períodos contratados em uma semana, hoje e 30 dias antes (a base do "aumentou"). */
  semanaAtual: number;
  semanaAnterior: number;
}

export interface ResultadoClassificacao {
  classificacao: ClassificacaoParceiro;
  motivo: ClassificacaoMotivo;
  parametros: ClassificacaoParametros;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** Dias inteiros de `de` até `ate` (`AAAA-MM-DD`). */
export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / DIA_MS);
}

function resultado(
  classificacao: ClassificacaoParceiro,
  motivo: ClassificacaoMotivo,
  parametros: ClassificacaoParametros = {},
): ResultadoClassificacao {
  return { classificacao, motivo, parametros };
}

export function classificarParceiro(e: EntradaClassificacao): ResultadoClassificacao {
  if (!e.profissionalAtivo) return resultado('INATIVO', 'PROFISSIONAL_INATIVO');
  if (!e.contratoAtivo) return resultado('INATIVO', 'SEM_CONTRATO_ATIVO');
  if (e.estrategico) return resultado('ESTRATEGICO', 'MARCADO_ESTRATEGICO');

  if (e.inicioRelacionamento !== null) {
    const dias = diasEntre(e.inicioRelacionamento, e.hoje);
    if (dias <= CLASSIFICACAO_NOVO_DIAS) return resultado('NOVO', 'CONTRATO_RECENTE', { dias });
  }

  const uso = { contratados: e.contratados, utilizados: e.contratadosUsados };
  if (
    e.contratados > 0 &&
    (e.contratadosUsados / e.contratados) * 100 < CLASSIFICACAO_RISCO_TAXA_MAXIMA
  ) {
    return resultado('EM_RISCO', 'BAIXO_USO', uso);
  }

  if (e.semanaAtual > e.semanaAnterior) {
    return resultado('EM_EXPANSAO', 'MAIS_PERIODOS', {
      semanaAnterior: e.semanaAnterior,
      semanaAtual: e.semanaAtual,
    });
  }
  if (e.utilizados > e.contratados) {
    return resultado('EM_EXPANSAO', 'USO_ACIMA_DO_CONTRATADO', {
      contratados: e.contratados,
      utilizados: e.utilizados,
    });
  }

  return resultado('ATIVO', 'USO_REGULAR', uso);
}
