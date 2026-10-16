import {
  catalogoRelatoriosSchema,
  paginaRelatorioSchema,
  selecaoRelatorioSchema,
  type RelatorioResumo,
  type TelaRelatorios,
} from '@torres/shared';
import { useQuery } from '@tanstack/react-query';
import { BarChart3Icon } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api/client';
import { DataGrid } from '../data-grid/DataGrid';
import { EmptyState } from '../EmptyState';
import { FormField } from '../form/FormField';
import { FormLayout } from '../form/FormLayout';
import { useFormulario } from '../form/use-formulario';
import { PageHeader, type ItemBreadcrumb } from '../PageHeader';
import { colunasDoRelatorio } from './colunas-relatorio';
import { useSelecaoRelatorio } from './use-selecao-relatorio';

export interface ReportPageProps {
  /** Tela de Relatórios do módulo, ex.: `financeiro.relatorios`. Define a API e as permissões. */
  tela: TelaRelatorios;
  titulo: string;
  descricao?: string;
  /** Padrão: "Painel > <título>". Os prints usam "Painel > <Módulo> > Relatorios". */
  breadcrumb?: ItemBreadcrumb[];
}

const SUFIXO = '.relatorios';

/**
 * Página padrão das 7 telas de Relatórios (CLAUDE.md, seção 3): seletor de relatório, período
 * De/Até e o resultado no `DataGrid` (ordenação, paginação, colunas e exportação Excel/PDF).
 * Os relatórios, as colunas e os filtros vêm da API (`GET /api/<modulo>/relatorios`), já
 * filtrados pelas permissões do usuário. O resultado carrega ao escolher o relatório ou mudar
 * o período, sem botão; relatório e período ficam na URL.
 */
export function ReportPage({ tela, titulo, descricao, breadcrumb }: Readonly<ReportPageProps>) {
  const url = `/api/${tela.slice(0, -SUFIXO.length)}/relatorios`;
  const catalogo = useQuery({
    queryKey: ['relatorios', url],
    queryFn: ({ signal }) => apiFetch(url, { schema: catalogoRelatoriosSchema, signal }),
  });
  const { selecao, aplicar } = useSelecaoRelatorio();
  const form = useFormulario(selecaoRelatorioSchema, { mode: 'onChange', defaultValues: selecao });

  // Sem botão "Gerar": cada mudança válida é aplicada (o erro do período aparece no campo).
  useEffect(() => {
    const assinatura = form.watch(() => void form.handleSubmit(aplicar)());
    return () => assinatura.unsubscribe();
  }, [form, aplicar]);

  const relatorios = catalogo.data?.data;
  const relatorio = relatorios?.find((item) => item.id === selecao.relatorio);
  // Link para um relatório fora do catálogo (sem permissão ou inexistente): volta ao seletor vazio.
  const foraDoCatalogo = relatorios !== undefined && selecao.relatorio !== '' && !relatorio;
  useEffect(() => {
    if (foraDoCatalogo) form.setValue('relatorio', '');
  }, [foraDoCatalogo, form]);
  const opcoes = useMemo(
    () =>
      (relatorios ?? []).map((item) => ({ valor: item.id, rotulo: `${item.id} — ${item.nome}` })),
    [relatorios],
  );
  const { errors } = form.formState;
  const periodoValido = !errors.de && !errors.ate;

  return (
    <div className="grid gap-6">
      <PageHeader titulo={titulo} descricao={descricao} breadcrumb={breadcrumb} />
      <section
        aria-label="Seleção do relatório"
        className="rounded-xl border bg-card p-4 shadow-xs"
      >
        <FormLayout form={form} onSubmit={aplicar} acoes={null} colunas={3}>
          <FormField
            name="relatorio"
            label="Relatório"
            tipo="select"
            opcoes={opcoes}
            placeholder={placeholderDoSeletor(catalogo.isPending, opcoes.length)}
            disabled={catalogo.isPending}
          />
          <FormField name="de" label="De" tipo="data" obrigatorio />
          <FormField name="ate" label="Até" tipo="data" obrigatorio />
        </FormLayout>
      </section>
      <Resultado
        url={url}
        tela={tela}
        relatorio={relatorio}
        carregando={catalogo.isPending}
        periodo={periodoValido ? { de: selecao.de, ate: selecao.ate } : undefined}
      />
    </div>
  );
}

function placeholderDoSeletor(carregando: boolean, opcoes: number): string {
  if (carregando) return 'Carregando...';
  return opcoes > 0 ? 'Selecione um relatório...' : 'Nenhum relatório disponível';
}

function Resultado({
  url,
  tela,
  relatorio,
  carregando,
  periodo,
}: Readonly<{
  url: string;
  tela: TelaRelatorios;
  relatorio?: RelatorioResumo;
  carregando: boolean;
  periodo?: { de: string; ate: string };
}>) {
  const colunas = useMemo(() => relatorio && colunasDoRelatorio(relatorio), [relatorio]);
  if (carregando) return <Skeleton className="h-40 w-full" aria-label="Carregando relatórios" />;
  if (!relatorio || !colunas) {
    return (
      <EmptyState
        icone={BarChart3Icon}
        titulo="Selecione um relatório"
        descricao="Escolha o relatório e o período para ver o resultado."
      />
    );
  }
  if (!periodo) return null;
  return (
    <DataGrid
      // Outro relatório tem outras colunas: o grid recomeça (colunas visíveis, ordenação).
      key={relatorio.id}
      url={`${url}/${relatorio.id}`}
      schema={paginaRelatorioSchema}
      colunas={colunas}
      idLinha={(_linha, indice) => String(indice)}
      consultaFixa={periodo}
      busca={false}
      filtros={relatorio.filtros}
      exportacao={{
        permissao: `${tela}.exportar`,
        nomeArquivo: `relatorio-${relatorio.id.toLowerCase()}`,
      }}
      mensagemVazio="Nenhum registro no período."
    />
  );
}
