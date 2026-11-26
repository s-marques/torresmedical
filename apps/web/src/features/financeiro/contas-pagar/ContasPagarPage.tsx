import {
  CONTA_PAGAR_APROVACOES,
  CONTA_PAGAR_ROTULO_FILTRO_STATUS,
  CONTA_PAGAR_ROTULO_STATUS_EXIBICAO,
  contaPagarPageSchema,
  exportContasPagarQuerySchema,
  listContasPagarQuerySchema,
  statusExibicaoContaPagar,
  type ContaPagar,
} from '@torres/shared';
import { BanknoteIcon, CheckCircle2Icon, XCircleIcon, BanIcon } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import type {
  AcaoLinha,
  ColunaGrid,
  ExportacaoGrid,
  FiltroGrid,
} from '@/components/shared/data-grid/tipos';
import { PageHeader } from '@/components/shared/PageHeader';
import type { TFunction } from 'i18next';
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
import { ModalRecusaContaPagar } from './ModalRecusaContaPagar';
import { SituacaoAprovacao } from './SituacaoAprovacao';
import {
  useAprovarContaPagar,
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

function criarColunas(t: TFunction): ColunaGrid<ContaPagar>[] {
  return [
    ...colunasContaFinanceira<ContaPagar>(
      {
        id: 'beneficiario',
        titulo: 'Fornecedor / Funcionário',
        ordenavel: true,
        exportavel: true,
        celula: (c) => c.beneficiarioNome ?? '-',
      },
      statusExibicaoContaPagar,
      CONTA_PAGAR_ROTULO_STATUS_EXIBICAO,
    ),
    {
      id: 'aprovacao',
      titulo: t('contasPagar.aprovacao.coluna'),
      celula: (c) => <SituacaoAprovacao aprovacao={c.aprovacao} />,
    },
  ];
}

/** Filtro "Aprovação" (issue #164): o alerta "aguardando aprovação" abre a lista por `?aprovacao=`. */
function criarFiltrosExtras(t: TFunction): readonly FiltroGrid[] {
  return [
    {
      tipo: 'select',
      parametro: 'aprovacao',
      rotulo: t('contasPagar.aprovacao.filtro'),
      rotuloTodos: t('contasPagar.aprovacao.todas'),
      opcoes: CONTA_PAGAR_APROVACOES.map((valor) => ({
        valor,
        rotulo: t(`contasPagar.aprovacao.situacoes.${valor}`),
      })),
    },
  ];
}

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
  const [aprovando, setAprovando] = useState<ContaPagar | null>(null);
  const [recusando, setRecusando] = useState<ContaPagar | null>(null);
  const { t } = useTranslation();
  const colunas = useMemo(() => criarColunas(t), [t]);
  const filtros = useMemo(() => criarFiltrosExtras(t), [t]);
  const excluir = useExcluirContaPagar();
  const aprovar = useAprovarContaPagar();
  const cancelarBaixa = useCancelarBaixaContaPagar();

  const aguardandoAprovacao = (conta: ContaPagar) =>
    conta.status === 'PENDENTE' && conta.aprovacao === 'LANCADA';

  const acoes = (conta: ContaPagar): AcaoLinha[] =>
    acoesContaFinanceira({
      onDetalhar: () => setDetalhando(conta),
      onEditar: () => setEditando(conta),
      onExcluir: () => setExcluindo(conta),
      permissaoEditar: 'financeiro.contas-pagar.editar',
      permissaoExcluir: 'financeiro.contas-pagar.excluir',
      extras: [
        {
          rotulo: t('contasPagar.aprovacao.aprovar'),
          icone: CheckCircle2Icon,
          permissao: 'financeiro.contas-pagar.aprovar',
          desabilitada: !aguardandoAprovacao(conta),
          onSelect: () => setAprovando(conta),
        },
        {
          rotulo: t('contasPagar.aprovacao.recusar'),
          icone: BanIcon,
          permissao: 'financeiro.contas-pagar.aprovar',
          desabilitada: !aguardandoAprovacao(conta),
          onSelect: () => setRecusando(conta),
        },
        {
          rotulo: 'Editar Baixa',
          icone: BanknoteIcon,
          permissao: 'financeiro.contas-pagar.editar',
          desabilitada: conta.status !== 'PENDENTE' || conta.aprovacao !== 'APROVADA',
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
        colunas,
        busca: 'Buscar contas a pagar...',
        status: STATUS,
        exportacao: EXPORTACAO,
        acoes,
        aoClicarLinha: setDetalhando,
        mensagemVazio: 'Nenhuma conta a pagar encontrada.',
      }}
      filtrosExtras={filtros}
      tituloExcluir="Excluir Conta a Pagar"
      excluindo={excluindo}
      onCancelarExclusao={() => setExcluindo(null)}
      onExcluir={(conta) => excluir.mutateAsync(conta.id)}
    >
      {criando && <ModalContaPagar onFechar={() => setCriando(false)} />}
      {editando && <ModalContaPagar conta={editando} onFechar={() => setEditando(null)} />}
      {baixando && <ModalBaixaContaPagar conta={baixando} onFechar={() => setBaixando(null)} />}
      {recusando && <ModalRecusaContaPagar conta={recusando} onFechar={() => setRecusando(null)} />}
      <ConfirmDialog
        aberto={aprovando !== null}
        onAbertoChange={(aberto) => aberto || setAprovando(null)}
        titulo={t('contasPagar.aprovacao.aprovarTitulo')}
        descricao={t('contasPagar.aprovacao.aprovarDescricao', {
          descricao: aprovando?.descricao ?? '',
        })}
        rotuloConfirmar={t('contasPagar.aprovacao.aprovar')}
        onConfirmar={() => (aprovando ? aprovar.mutateAsync(aprovando.id) : undefined)}
      />
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
          onAprovar={() => {
            setAprovando(detalhando);
            setDetalhando(null);
          }}
          onRecusar={() => {
            setRecusando(detalhando);
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
