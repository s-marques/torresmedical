import {
  codificarMensagemValidacao,
  comTradutorValidacao,
  decodificarMensagemValidacao,
  traduzirPtBr,
  type ErrorDetail,
} from '@torres/shared';
import type { z } from 'zod';

/** Mensagem do detalhe: texto em português e, se a mensagem veio por chave, `code` e `params`. */
function mensagemDoDetalhe(texto: string): Pick<ErrorDetail, 'message' | 'code' | 'params'> {
  const mensagem = decodificarMensagemValidacao(texto);
  if (!mensagem) return { message: texto };
  return {
    message: traduzirPtBr(mensagem),
    code: mensagem.chave,
    ...(mensagem.params ? { params: mensagem.params } : {}),
  };
}

/**
 * Converte os erros do Zod em `details` por campo (`field` com caminho em ponto, ex.: `itens.0.valor`).
 * Campos não permitidos geram um detalhe por campo.
 */
export function zodIssuesToDetails(issues: readonly z.core.$ZodIssue[]): ErrorDetail[] {
  return issues.flatMap((issue): ErrorDetail[] => {
    const path = issue.path.map(String);
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({
        field: [...path, key].join('.'),
        message: traduzirPtBr({ chave: 'validacao.campoNaoPermitido' }),
        code: 'validacao.campoNaoPermitido',
      }));
    }
    return [{ field: path.join('.'), ...mensagemDoDetalhe(issue.message) }];
  });
}

/**
 * `schema.safeParse` com as mensagens por chave codificadas, para `zodIssuesToDetails` devolver
 * `code`/`params` (issue #205). A validação é síncrona: o tradutor volta ao anterior em seguida.
 */
export function validarComCodigos<T extends z.ZodType>(
  schema: T,
  valor: unknown,
): z.ZodSafeParseResult<z.output<T>> {
  return comTradutorValidacao(codificarMensagemValidacao, () => {
    const result = schema.safeParse(valor);
    // O Zod só monta as mensagens ao ler `error.issues`: lê aqui, ainda com o tradutor que codifica.
    if (!result.success) for (const issue of result.error.issues) void issue.message;
    return result;
  });
}
