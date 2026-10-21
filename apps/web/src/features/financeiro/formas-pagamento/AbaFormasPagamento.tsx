import {
  exportFormasPagamentoQuerySchema,
  FORMA_PAGAMENTO_ROTULO_FINALIDADE,
  FORMA_PAGAMENTO_ROTULO_TIPO,
  formaPagamentoPageSchema,
  listFormasPagamentoQuerySchema,
  type FormaPagamento,
} from '@torres/shared';
import { CreditCardIcon, PencilIcon, PowerIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, ExportacaoGrid } from '@/components/shared/data-grid/tipos';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusAtivo, StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { usePermissao } from '@/lib/auth/use-sessao';
import { ModalFormaPagamento } from './ModalFormaPagamento';
import {
  URL_FORMAS_PAGAMENTO,
  useAlterarAtivaForma,
  useExcluirForma,
} from './use-formas-pagamento';

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'financeiro.formas-pagamento.exportar',
  nomeArquivo: 'formas-pagamento',
  schema: exportFormasPagamentoQuerySchema,
};

export interface AbaFormasPagamentoProps {
  criando: boolean;
  onFecharCriar: () => void;
}

/** Aba "Formas de Pagamento": grid com busca, Colunas, Exportar e ações Ativar/Desativar, Editar e Excluir. */
export function AbaFormasPagamento({ criando, onFecharCriar }: Readonly<AbaFormasPagamentoProps>) {
  const [editando, setEditando] = useState<FormaPagamento | null>(null);
  const [excluindo, setExcluindo] = useState<FormaPagamento | null>(null);
  const podeEditar = usePermissao('financeiro.formas-pagamento.editar');
  const alterarAtiva = useAlterarAtivaForma();
  const excluir = useExcluirForma();

  const colunas: ColunaGrid<FormaPagamento>[] = [
    {
      id: 'nome',
      titulo: 'Nome',
      ordenavel: true,
      exportavel: true,
      celula: (forma) => (
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
          >
            <CreditCardIcon className="size-4" />
          </span>
          <span className="font-medium">{forma.nome}</span>
        </div>
      ),
    },
    {
      id: 'finalidade',
      titulo: 'Finalidade',
      exportavel: true,
      ocultavel: false,
      celula: (forma) => (
        <StatusBadge tom="sucesso">
          {FORMA_PAGAMENTO_ROTULO_FINALIDADE[forma.finalidade]}
        </StatusBadge>
      ),
    },
    {
      id: 'tipo',
      titulo: 'Tipo',
      ordenavel: true,
      exportavel: true,
      celula: (forma) => (
        <StatusBadge tom="sucesso">{FORMA_PAGAMENTO_ROTULO_TIPO[forma.tipo]}</StatusBadge>
      ),
    },
    {
      id: 'prazoRecebimentoDias',
      titulo: 'Prazo',
      ordenavel: true,
      exportavel: true,
      celula: (forma) => `${forma.prazoRecebimentoDias} dias`,
    },
    {
      id: 'maxParcelas',
      titulo: 'Max. Parcelas',
      ordenavel: true,
      exportavel: true,
      celula: (forma) => `${forma.maxParcelas}x`,
    },
    {
      id: 'ativo',
      titulo: 'Status',
      ordenavel: true,
      exportavel: true,
      celula: (forma) => <StatusAtivo ativo={forma.ativo} />,
    },
    {
      id: 'acoes',
      titulo: 'Ações',
      ocultavel: false,
      celula: (forma) => {
        const rotuloAtiva = forma.ativo ? 'Desativar' : 'Ativar';
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={forma.ativo ? 'text-emerald-600 hover:text-emerald-600' : undefined}
              aria-label={`${rotuloAtiva} ${forma.nome}`}
              title={rotuloAtiva}
              disabled={!podeEditar || alterarAtiva.isPending}
              onClick={() => alterarAtiva.mutate({ id: forma.id, ativo: !forma.ativo })}
            >
              <PowerIcon aria-hidden />
            </Button>
            <SePermitido permissao="financeiro.formas-pagamento.editar">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Editar ${forma.nome}`}
                title="Editar"
                onClick={() => setEditando(forma)}
              >
                <PencilIcon aria-hidden />
              </Button>
            </SePermitido>
            <SePermitido permissao="financeiro.formas-pagamento.excluir">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-destructive hover:text-destructive"
                aria-label={`Excluir ${forma.nome}`}
                title="Excluir"
                onClick={() => setExcluindo(forma)}
              >
                <Trash2Icon aria-hidden />
              </Button>
            </SePermitido>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <DataGrid
        url={URL_FORMAS_PAGAMENTO}
        schema={formaPagamentoPageSchema}
        querySchema={listFormasPagamentoQuerySchema}
        colunas={colunas}
        busca="Buscar formas de pagamento..."
        exportacao={EXPORTACAO}
        mensagemVazio="Nenhuma forma de pagamento encontrada."
      />
      {criando && <ModalFormaPagamento onFechar={onFecharCriar} />}
      {editando && <ModalFormaPagamento forma={editando} onFechar={() => setEditando(null)} />}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir Forma de Pagamento"
        descricao={`Tem certeza que deseja excluir "${excluindo?.nome ?? ''}"?`}
        rotuloConfirmar="Excluir"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </>
  );
}
