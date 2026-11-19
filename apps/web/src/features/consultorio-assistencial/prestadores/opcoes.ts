import {
  PRESTADOR_AVALIACAO_PRECO_ROTULOS,
  PRESTADOR_AVALIACOES_PRECO,
  PRESTADOR_CATEGORIA_ROTULOS,
  PRESTADOR_CATEGORIAS,
  PRESTADOR_FORMA_PAGAMENTO_ROTULOS,
  PRESTADOR_FORMAS_PAGAMENTO,
  PRESTADOR_NOTA_MAX,
  PRESTADOR_NOTA_MIN,
  PRESTADOR_STATUS,
  PRESTADOR_STATUS_ROTULOS,
  PRESTADOR_TIPO_PESSOA_ROTULOS,
  PRESTADOR_TIPOS_PESSOA,
  rotuloNotaPrestador,
} from '@torres/shared';
import type { OpcaoCampo } from '@/components/shared/form/tipos';

function opcoes<T extends string>(
  valores: readonly T[],
  rotulos: Readonly<Record<T, string>>,
): readonly OpcaoCampo[] {
  return valores.map((valor) => ({ valor, rotulo: rotulos[valor] }));
}

export const OPCOES_STATUS = opcoes(PRESTADOR_STATUS, PRESTADOR_STATUS_ROTULOS);
export const OPCOES_TIPO_PESSOA = opcoes(PRESTADOR_TIPOS_PESSOA, PRESTADOR_TIPO_PESSOA_ROTULOS);
export const OPCOES_CATEGORIA = opcoes(PRESTADOR_CATEGORIAS, PRESTADOR_CATEGORIA_ROTULOS);
export const OPCOES_FORMA_PAGAMENTO = opcoes(
  PRESTADOR_FORMAS_PAGAMENTO,
  PRESTADOR_FORMA_PAGAMENTO_ROTULOS,
);
export const OPCOES_AVALIACAO_PRECO = opcoes(
  PRESTADOR_AVALIACOES_PRECO,
  PRESTADOR_AVALIACAO_PRECO_ROTULOS,
);

/** "1 - Péssimo" … "5 - Ótimo". O valor é o texto da nota ("3"). */
export const OPCOES_NOTA: readonly OpcaoCampo[] = Array.from(
  { length: PRESTADOR_NOTA_MAX - PRESTADOR_NOTA_MIN + 1 },
  (_, i) => {
    const nota = PRESTADOR_NOTA_MIN + i;
    return { valor: String(nota), rotulo: rotuloNotaPrestador(nota) };
  },
);
