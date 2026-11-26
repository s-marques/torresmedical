import type { Permissao } from '@torres/shared';
import { PlusIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { DataGridProps, FiltroGrid } from '@/components/shared/data-grid/tipos';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { FILTROS_CONTA_FINANCEIRA } from './grid';

export interface PaginaContaFinanceiraProps<C extends { id: string; descricao: string }> {
  titulo: string;
  descricao: string;
  permissaoCriar: Permissao;
  onCriar: () => void;
  grid: Omit<DataGridProps<C>, 'filtros'>;
  /** Filtros próprios da tela, depois do período de vencimento (ex.: Aprovação em Contas a Pagar). */
  filtrosExtras?: readonly FiltroGrid[];
  /** Título do diálogo de exclusão, ex.: "Excluir Conta a Pagar". */
  tituloExcluir: string;
  /** Conta aguardando a confirmação de exclusão (`null`: diálogo fechado). */
  excluindo: C | null;
  onCancelarExclusao: () => void;
  onExcluir: (conta: C) => Promise<unknown>;
  /** Abas da tela, logo abaixo do cabeçalho (ex.: Contas a Pagar tem Divergências e Centros de Custo). */
  abas?: ReactNode;
  /** Modais da tela (cadastro, edição, detalhe...). */
  children: ReactNode;
}

/** Página de Contas a Pagar e Contas a Receber: cabeçalho, grid e confirmação de exclusão. */
export function PaginaContaFinanceira<C extends { id: string; descricao: string }>({
  titulo,
  descricao,
  permissaoCriar,
  onCriar,
  grid,
  filtrosExtras = [],
  tituloExcluir,
  excluindo,
  onCancelarExclusao,
  onExcluir,
  abas,
  children,
}: Readonly<PaginaContaFinanceiraProps<C>>) {
  return (
    <div className="grid gap-6">
      <PageHeader
        titulo={titulo}
        descricao={descricao}
        acoes={
          <SePermitido permissao={permissaoCriar}>
            <Button type="button" onClick={onCriar}>
              <PlusIcon aria-hidden />
              Nova Conta
            </Button>
          </SePermitido>
        }
      />
      {abas}
      <DataGrid {...grid} filtros={[...FILTROS_CONTA_FINANCEIRA, ...filtrosExtras]} />
      {children}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || onCancelarExclusao()}
        titulo={tituloExcluir}
        descricao={`Tem certeza que deseja excluir a conta "${excluindo?.descricao ?? ''}"? Esta ação não pode ser desfeita.`}
        rotuloConfirmar="Excluir"
        onConfirmar={() => (excluindo ? onExcluir(excluindo) : undefined)}
      />
    </div>
  );
}
