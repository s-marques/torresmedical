import type { AiGrowthInsight } from '@torres/shared';
import type { TFunction } from 'i18next';
import { formatoNumero } from '@/lib/i18n';
import { formatarMoeda } from '@/lib/forms/mascaras';

export interface TextosInsight {
  titulo: string;
  descricao: string;
  destaque: string;
  acao: string;
}

/**
 * Textos do insight no idioma atual. A API manda só o tipo e os números; aqui eles entram nos
 * textos de `aiGrowth.tipos.<TIPO>`. Sem ocorrências (`quantidade` 0) vale a versão "vazio".
 */
export function textosDoInsight(t: TFunction, insight: AiGrowthInsight): TextosInsight {
  const { tipo, quantidade, parametros } = insight;
  const base = `aiGrowth.tipos.${tipo}`;
  const valores = {
    count: quantidade,
    dias: parametros.dias,
    media: formatoNumero({ maximumFractionDigits: 1 }).format(parametros.media ?? 0),
    faturado: formatarMoeda(parametros.faturado ?? 0),
  };
  const vazio = quantidade === 0;
  const plural = quantidade === 1 ? 'Um' : 'Varios';
  return {
    titulo: t(`${base}.${vazio ? 'tituloVazio' : `titulo${plural}`}`, valores),
    descricao: t(`${base}.${vazio ? 'descricaoVazio' : 'descricao'}`, valores),
    destaque: t(`${base}.${vazio ? 'destaqueVazio' : `destaque${plural}`}`, valores),
    acao: t(`${base}.${vazio ? 'acaoVazio' : 'acao'}`, valores),
  };
}
