import {
  CONTA_RECEBER_ROTULO_FILTRO_STATUS,
  CONTA_RECEBER_ROTULO_STATUS_EXIBICAO,
  exportContasReceberQuerySchema,
  listContasReceberQuerySchema,
  contaReceberPageSchema,
  statusExibicaoContaReceber,
  type ContaReceber,
} from '@torres/shared';
import { BanknoteIcon, HandshakeIcon, XCircleIcon } from 'lucide-react';
import type { TFunction } from 'i18next';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AcaoLinha, ColunaGrid, ExportacaoGrid } from '@/components/shared/data-grid/tipos';
import { formatarMoeda } from '@/lib/forms/mascaras';
import {
  acoesContaFinanceira,
  colunasContaFinanceira,
  filtroStatusContaFinanceira,
} from '../contas-financeiras/grid';
import { PaginaContaFinanceira } from '../contas-financeiras/PaginaContaFinanceira';
import { DetalheContaReceber } from './DetalheContaReceber';
import { ModalCancelarContaReceber } from './ModalCancelarContaReceber';
import { ModalBaixaContaReceber } from './ModalBaixaContaReceber';
import { ModalContaReceber } from './ModalContaReceber';
import { ModalRenegociarContaReceber } from './ModalRenegociarContaReceber';
import { contaComBaixaCancelavel, contaComSaldoEmAberto } from './regras-conta-receber';
import {
  URL_CONTAS_RECEBER,
  useCancelarBaixaContaReceber,
  useExcluirContaReceber,
} from './use-contas-receber';

const STATUS = filtroStatusContaFinanceira(CONTA_RECEBER_ROTULO_FILTRO_STATUS);

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'financeiro.contas-receber.exportar',
  nomeArquivo: 'contas-receber',
  schema: exportContasReceberQuerySchema,
};

/** Colunas do inventário mais Contrato e Saldo (issue #165); o cliente pode ser o profissional. */
function criarColunas(t: TFunction): ColunaGrid<ContaReceber>[] {
  return [
    ...colunasContaFinanceira<ContaReceber>(
      {
        id: 'cliente',
        titulo: 'Cliente',
        ordenavel: true,
        exportavel: true,
        celula: (c) => c.pacienteNome ?? c.profissionalSacadoNome ?? '-',
      },
      statusExibicaoContaReceber,
      CONTA_RECEBER_ROTULO_STATUS_EXIBICAO,
    ),
    {
      id: 'contrato',
      titulo: t('contasReceber.colunas.contrato'),
      celula: (c) => (c.contratoSalaNumero === null ? '-' : `#${c.contratoSalaNumero}`),
    },
    {
      id: 'saldo',
      titulo: t('contasReceber.colunas.saldo'),
      celula: (c) => formatarMoeda(Number(c.saldo)),
    },
  ];
}

/**
 * Contas a Receber (`/receber`, docs/inventario/telas/financeiro-contas-a-receber.md): gerencie
 * suas contas a receber e receitas.
 */
export default function ContasReceberPage() {
  const { t } = useTranslation();
  const [criando, setCriando] = useState(false);
  const [detalhando, setDetalhando] = useState<ContaReceber | null>(null);
  const [editando, setEditando] = useState<ContaReceber | null>(null);
  const [cancelando, setCancelando] = useState<ContaReceber | null>(null);
  const [baixando, setBaixando] = useState<ContaReceber | null>(null);
  const [renegociando, setRenegociando] = useState<ContaReceber | null>(null);
  const [excluindo, setExcluindo] = useState<ContaReceber | null>(null);
  const colunas = useMemo(() => criarColunas(t), [t]);
  const excluir = useExcluirContaReceber();
  const cancelarBaixa = useCancelarBaixaContaReceber();

  const acoes = (conta: ContaReceber): AcaoLinha[] =>
    acoesContaFinanceira({
      onDetalhar: () => setDetalhando(conta),
      onEditar: () => setEditando(conta),
      onExcluir: () => setExcluindo(conta),
      permissaoEditar: 'financeiro.contas-receber.editar',
      permissaoExcluir: 'financeiro.contas-receber.excluir',
      // Cancelar com motivo (#162) só vale para conta A vencer, sem baixa.
      cancelamento: {
        onCancelar: () => setCancelando(conta),
        desabilitada: conta.status !== 'PENDENTE',
      },
      extras: [
        {
          rotulo: t('contasReceber.acoes.baixar'),
          icone: BanknoteIcon,
          permissao: 'financeiro.contas-receber.editar',
          desabilitada: !contaComSaldoEmAberto(conta),
          onSelect: () => setBaixando(conta),
        },
        {
          rotulo: t('contasReceber.acoes.renegociar'),
          icone: HandshakeIcon,
          permissao: 'financeiro.contas-receber.editar',
          desabilitada: !contaComSaldoEmAberto(conta),
          onSelect: () => setRenegociando(conta),
        },
        {
          rotulo: t('contasReceber.acoes.cancelarBaixa'),
          icone: XCircleIcon,
          permissao: 'financeiro.contas-receber.editar',
          desabilitada: !contaComBaixaCancelavel(conta),
          onSelect: () => cancelarBaixa.mutateAsync(conta.id),
        },
      ],
    });

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
        colunas,
        busca: 'Buscar contas a receber...',
        status: STATUS,
        exportacao: EXPORTACAO,
        acoes,
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
      {cancelando && (
        <ModalCancelarContaReceber conta={cancelando} onFechar={() => setCancelando(null)} />
      )}
      {baixando && <ModalBaixaContaReceber conta={baixando} onFechar={() => setBaixando(null)} />}
      {renegociando && (
        <ModalRenegociarContaReceber conta={renegociando} onFechar={() => setRenegociando(null)} />
      )}
      {detalhando && (
        <DetalheContaReceber
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
          onRenegociar={() => {
            setRenegociando(detalhando);
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
