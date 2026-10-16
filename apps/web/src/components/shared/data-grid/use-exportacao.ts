import type { ExportFormat, Permissao } from '@torres/shared';
import { useMutation } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { baixarArquivo } from '@/lib/api/download';
import { usePermissoes } from '@/lib/auth/use-sessao';
import type { ValidadorConsulta } from './tipos';

export interface OpcoesExportacao {
  /** Ex.: `/api/configuracoes-gestao/unidades/export`. */
  url: string;
  /** Sem ela (ou sem a permissão no perfil), `permitido` é `false`. */
  permissao?: Permissao;
  nomeArquivo?: string;
  /** Ex.: `exportUnidadesQuerySchema`. */
  schema?: ValidadorConsulta;
  /** Parâmetros fixos, além dos da URL (ex.: período da `ReportPage`). */
  consultaFixa?: Readonly<Record<string, string>>;
}

/** Parâmetros da URL que são da paginação, não da exportação. */
const SO_DA_LISTAGEM: ReadonlySet<string> = new Set(['page', 'pageSize']);

/**
 * Exportação Excel/PDF com os mesmos filtros e ordenação do grid (lidos da URL). O `DataGrid`
 * usa no botão "Exportar"; telas com botões "Excel"/"PDF" no `PageHeader` (Contas a Pagar e a
 * Receber) usam direto. Erros da API aparecem pelo tratamento global (toast).
 */
export function useExportacao({
  url,
  permissao,
  nomeArquivo = 'exportacao',
  schema,
  consultaFixa,
}: OpcoesExportacao) {
  const permissoes = usePermissoes();
  const permitido = permissao !== undefined && permissoes.includes(permissao);
  const [params] = useSearchParams();
  const mutation = useMutation({
    mutationFn: async ({
      format,
      colunas,
    }: {
      format: ExportFormat;
      colunas?: readonly string[];
    }) => {
      const query: Record<string, string> = {};
      params.forEach((valor, chave) => {
        if (!SO_DA_LISTAGEM.has(chave)) query[chave] = valor;
      });
      Object.assign(query, consultaFixa);
      query.format = format;
      if (colunas?.length) query.columns = colunas.join(',');

      const validacao = schema?.safeParse(query);
      if (validacao && !validacao.success) {
        toast.error(validacao.error.issues[0]?.message ?? 'Exportação inválida');
        return;
      }
      await baixarArquivo(url, query, `${nomeArquivo}.${format}`);
    },
  });

  return {
    /** O usuário tem a permissão de exportar. */
    permitido,
    exportando: mutation.isPending,
    /** `colunas`: chaves das colunas visíveis (`columns=`). Sem elas, a API exporta todas. */
    exportar: (format: ExportFormat, colunas?: readonly string[]) =>
      mutation.mutate({ format, colunas }),
  };
}
