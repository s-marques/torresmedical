import {
  CONTA_RECEBER_ROTULO_FILTRO_STATUS,
  CONTA_RECEBER_ROTULO_STATUS_EXIBICAO,
  exportContasReceberQuerySchema,
  listContasReceberQuerySchema,
  contaReceberPageSchema,
  statusExibicaoContaReceber,
  type ContaReceber,
} from '@torres/shared';
import { useState } from 'react';
import type { ExportacaoGrid } from '@/components/shared/data-grid/tipos';
import {
  acoesContaFinanceira,
  colunasContaFinanceira,
  filtroStatusContaFinanceira,
} from '../contas-financeiras/grid';
import { PaginaContaFinanceira } from '../contas-financeiras/PaginaContaFinanceira';
import { DetalheContaReceber } from './DetalheContaReceber';
import { ModalContaReceber } from './ModalContaReceber';
import { URL_CONTAS_RECEBER, useExcluirContaReceber } from './use-contas-receber';

const STATUS = filtroStatusContaFinanceira(CONTA_RECEBER_ROTULO_FILTRO_STATUS);

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'financeiro.contas-receber.exportar',
  nomeArquivo: 'contas-receber',
  schema: exportContasReceberQuerySchema,
};

const COLUNAS = colunasContaFinanceira<ContaReceber>(
  {
    id: 'cliente',
    titulo: 'Cliente',
    ordenavel: true,
    exportavel: true,
    celula: (c) => c.pacienteNome ?? '-',
  },
  statusExibicaoContaReceber,
  CONTA_RECEBER_ROTULO_STATUS_EXIBICAO,
);

/**
 * Contas a Receber (`/receber`, docs/inventario/telas/financeiro-contas-a-receber.md): gerencie
 * suas contas a receber e receitas.
 */
export default function ContasReceberPage() {
  const [criando, setCriando] = useState(false);
  const [detalhando, setDetalhando] = useState<ContaReceber | null>(null);
  const [editando, setEditando] = useState<ContaReceber | null>(null);
  const [excluindo, setExcluindo] = useState<ContaReceber | null>(null);
  const excluir = useExcluirContaReceber();

  return (
    <PaginaContaFinanceira
      titulo="Contas a Receber"
      descricao="Gerencie suas contas a receber e receitas."
      permissaoCriar="financeiro.contas-receber.criar"
      onCriar={() => setCriando(true)}
      grid={{
        url: URL_CONTAS_RECEBER,
        schema: contaReceberPageSchema,
        querySchema: listContasReceberQuerySchema,
        colunas: COLUNAS,
        busca: 'Buscar contas a receber...',
        status: STATUS,
        exportacao: EXPORTACAO,
        acoes: (conta) =>
          acoesContaFinanceira({
            onDetalhar: () => setDetalhando(conta),
            onEditar: () => setEditando(conta),
            onExcluir: () => setExcluindo(conta),
            permissaoEditar: 'financeiro.contas-receber.editar',
            permissaoExcluir: 'financeiro.contas-receber.excluir',
          }),
        aoClicarLinha: setDetalhando,
        mensagemVazio: 'Nenhuma conta a receber encontrada.',
      }}
      tituloExcluir="Excluir Conta a Receber"
      excluindo={excluindo}
      onCancelarExclusao={() => setExcluindo(null)}
      onExcluir={(conta) => excluir.mutateAsync(conta.id)}
    >
      {criando && <ModalContaReceber onFechar={() => setCriando(false)} />}
      {editando && <ModalContaReceber conta={editando} onFechar={() => setEditando(null)} />}
      {detalhando && (
        <DetalheContaReceber
          conta={detalhando}
          onFechar={() => setDetalhando(null)}
          onEditar={() => {
            setEditando(detalhando);
            setDetalhando(null);
          }}
        />
      )}
    </PaginaContaFinanceira>
  );
}
