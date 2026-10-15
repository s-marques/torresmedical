import { exportUnidadesQuerySchema } from '@torres/shared';
import type { ExportacaoGrid } from '@/components/shared/data-grid/tipos';
import { ApiRequestError } from '@/lib/api/api-error';

export const URL_UNIDADES = '/api/configuracoes-gestao/unidades';

export const EXPORTACAO_UNIDADES: ExportacaoGrid = {
  permissao: 'configuracoes-gestao.minha-empresa.exportar',
  schema: exportUnidadesQuerySchema,
  nomeArquivo: 'unidades',
};

/** Espera simulada das ações de exemplo (nada é gravado na API). */
export function esperar(ms = 600): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const RESPOSTAS_SIMULADAS = {
  sucesso: 'Sucesso',
  campo: 'Erro 400 (no campo)',
  geral: 'Erro 409 (geral)',
} as const;

export type RespostaSimulada = keyof typeof RESPOSTAS_SIMULADAS;

/** Rejeita como a API faria, para mostrar como o `FormLayout` exibe cada erro. */
export async function simularEnvio(resposta: RespostaSimulada, campo: string): Promise<void> {
  await esperar();
  if (resposta === 'campo') {
    throw new ApiRequestError(400, {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Dados inválidos',
      details: [{ field: campo, message: 'Valor recusado pelo servidor (exemplo)' }],
    });
  }
  if (resposta === 'geral') {
    throw new ApiRequestError(409, {
      statusCode: 409,
      code: 'DUPLICATE',
      message: 'Registro duplicado (exemplo de erro geral do servidor)',
    });
  }
}
