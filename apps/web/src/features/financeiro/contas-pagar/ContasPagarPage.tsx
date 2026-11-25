import {
  CONTA_PAGAR_ROTULO_FILTRO_STATUS,
  CONTA_PAGAR_ROTULO_STATUS_EXIBICAO,
  contaPagarPageSchema,
  exportContasPagarQuerySchema,
  listContasPagarQuerySchema,
  statusExibicaoContaPagar,
  type ContaPagar,
} from '@torres/shared';
import { BanknoteIcon, XCircleIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { AcaoLinha, ExportacaoGrid } from '@/components/shared/data-grid/tipos';
import { PageHeader } from '@/components/shared/PageHeader';
import {
  acoesContaFinanceira,
  colunasContaFinanceira,
  filtroStatusContaFinanceira,
} from '../contas-financeiras/grid';
import { PaginaContaFinanceira } from '../contas-financeiras/PaginaContaFinanceira';
import { AbaCentrosCusto } from './AbaCentrosCusto';
import { AbaDivergencias } from './AbaDivergencias';
import { AbasContasPagar, type IdAbaContasPagar } from './AbasContasPagar';
import { DetalheContaPagar } from './DetalheContaPagar';
import { ModalBaixaContaPagar } from './ModalBaixaContaPagar';
import { ModalContaPagar } from './ModalContaPagar';
import {
  useCancelarBaixaContaPagar,
  URL_CONTAS_PAGAR,
  useExcluirContaPagar,
} from './use-contas-pagar';

const STATUS = filtroStatusContaFinanceira(CONTA_PAGAR_ROTULO_FILTRO_STATUS);

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'financeiro.contas-pagar.exportar',
  nomeArquivo: 'contas-pagar',
  schema: exportContasPagarQuerySchema,
};

const COLUNAS = colunasContaFinanceira<ContaPagar>(
  {
    id: 'beneficiario',
    titulo: 'Fornecedor / Funcionário',
    ordenavel: true,
    exportavel: true,
    celula: (c) => c.beneficiarioNome ?? '-',
  },
  statusExibicaoContaPagar,
  CONTA_PAGAR_ROTULO_STATUS_EXIBICAO,
);

/**
 * Contas a Pagar (`/pagar`, docs/inventario/telas/financeiro-contas-a-pagar.md): gerencie suas
 * contas a pagar e fornecedores. Além da lista, tem as abas Divergências e Centros de Custo
 * (issue #163).
 */
export default function ContasPagarPage() {
  const [aba, setAba] = useState<IdAbaContasPagar>('contas');
  const abas = <AbasContasPagar aba={aba} onAba={setAba} />;

  if (aba === 'contas') return <AbaContas abas={abas} />;
  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Contas a Pagar"
        descricao="Gerencie suas contas a pagar e fornecedores."
      />
      {abas}
      <div id="painel-aba-contas-pagar" role="tabpanel" aria-labelledby={`aba-${aba}`}>
        {aba === 'divergencias' ? <AbaDivergencias /> : <AbaCentrosCusto />}
      </div>
    </div>
  );
}

function AbaContas({ abas }: Readonly<{ abas: ReactNode }>) {
  const [criando, setCriando] = useState(false);
  const [detalhando, setDetalhando] = useState<ContaPagar | null>(null);
  const [editando, setEditando] = useState<ContaPagar | null>(null);
  const [baixando, setBaixando] = useState<ContaPagar | null>(null);
  const [excluindo, setExcluindo] = useState<ContaPagar | null>(null);
  const excluir = useExcluirContaPagar();
  const cancelarBaixa = useCancelarBaixaContaPagar();

  const acoes = (conta: ContaPagar): AcaoLinha[] =>
    acoesContaFinanceira({
      onDetalhar: () => setDetalhando(conta),
      onEditar: () => setEditando(conta),
      onExcluir: () => setExcluindo(conta),
      permissaoEditar: 'financeiro.contas-pagar.editar',
      permissaoExcluir: 'financeiro.contas-pagar.excluir',
      extras: [
        {
          rotulo: 'Editar Baixa',
          icone: BanknoteIcon,
          permissao: 'financeiro.contas-pagar.editar',
          desabilitada: conta.status !== 'PENDENTE',
          onSelect: () => setBaixando(conta),
        },
        {
          rotulo: 'Cancelar Baixa',
          icone: XCircleIcon,
          permissao: 'financeiro.contas-pagar.editar',
          desabilitada: Number(conta.valorPago) <= 0,
          onSelect: () => cancelarBaixa.mutateAsync(conta.id),
        },
      ],
    });

  return (
    <PaginaContaFinanceira
      titulo="Contas a Pagar"
      descricao="Gerencie suas contas a pagar e fornecedores."
      permissaoCriar="financeiro.contas-pagar.criar"
      onCriar={() => setCriando(true)}
      abas={abas}
      grid={{
        url: URL_CONTAS_PAGAR,
        schema: contaPagarPageSchema,
        querySchema: listContasPagarQuerySchema,
        colunas: COLUNAS,
        busca: 'Buscar contas a pagar...',
        status: STATUS,
        exportacao: EXPORTACAO,
        acoes,
        aoClicarLinha: setDetalhando,
        mensagemVazio: 'Nenhuma conta a pagar encontrada.',
      }}
      tituloExcluir="Excluir Conta a Pagar"
      excluindo={excluindo}
      onCancelarExclusao={() => setExcluindo(null)}
      onExcluir={(conta) => excluir.mutateAsync(conta.id)}
    >
      {criando && <ModalContaPagar onFechar={() => setCriando(false)} />}
      {editando && <ModalContaPagar conta={editando} onFechar={() => setEditando(null)} />}
      {baixando && <ModalBaixaContaPagar conta={baixando} onFechar={() => setBaixando(null)} />}
      {detalhando && (
        <DetalheContaPagar
          conta={detalhando}
          onFechar={() => setDetalhando(null)}
          onEditar={() => {
            setEditando(detalhando);
            setDetalhando(null);
          }}
          onBaixar={() => {
            setBaixando(detalhando);
            setDetalhando(null);
          }}
          onCancelarBaixa={() => {
            void cancelarBaixa.mutateAsync(detalhando.id);
            setDetalhando(null);
          }}
        />
      )}
    </PaginaContaFinanceira>
  );
}
