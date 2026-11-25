import {
  validarRespostas,
  type ModeloRespostaValor,
  type ModeloRespostas,
  type ModeloSecao,
} from '@torres/shared';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

/** Nome do campo no formulário: `respostas.<chave>`. */
export const nomeResposta = (chave: string) => `respostas.${chave}`;

/**
 * Valores iniciais do formulário: um por campo do modelo. Select guarda texto (`''` vazio) e o
 * campo numérico guarda número (`null` vazio), como o `FormField` espera.
 */
export function respostasIniciais(
  secoes: readonly ModeloSecao[],
  respostas: ModeloRespostas | null | undefined,
): Record<string, ModeloRespostaValor> {
  const inicial: Record<string, ModeloRespostaValor> = {};
  for (const secao of secoes) {
    for (const campo of secao.campos) {
      const valor = respostas?.[campo.chave] ?? null;
      if (campo.tipo === 'NUMERO') inicial[campo.chave] = valor === null ? null : Number(valor);
      else inicial[campo.chave] = valor === null ? '' : String(valor);
    }
  }
  return inicial;
}

/**
 * Confere as respostas do formulário e marca cada campo com problema. Devolve `true` quando
 * está tudo certo. Os obrigatórios só valem quando `exigirObrigatorios` (o servidor exige de novo
 * ao assinar).
 */
export function conferirRespostas<T extends FieldValues>(
  form: UseFormReturn<T, unknown, FieldValues>,
  secoes: readonly ModeloSecao[],
  respostas: Readonly<Record<string, ModeloRespostaValor>> | null | undefined,
  exigirObrigatorios: boolean,
): boolean {
  const erros = validarRespostas(secoes, respostas ?? {}, { exigirObrigatorios });
  for (const erro of erros) {
    form.setError(nomeResposta(erro.chave) as never, { type: 'validate', message: erro.mensagem });
  }
  return erros.length === 0;
}
