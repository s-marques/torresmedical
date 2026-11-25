import type { Permissao } from '@torres/shared';
import { PencilIcon, SearchIcon, Trash2Icon } from 'lucide-react';
import type {
  AcaoLinha,
  ColunaGrid,
  FiltroGrid,
  FiltroStatus,
} from '@/components/shared/data-grid/tipos';
import { formatarData } from '@/lib/formatar';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { StatusContaFinanceira } from './StatusContaFinanceira';

/**
 * Base comum dos grids de Contas a Pagar e Contas a Receber: mesmos chips de status, filtro de
 * vencimento e colunas; cada tela informa só a coluna da pessoa (fornecedor/funcionário ou cliente).
 */

/** Chips "Todos" (ausente) e os rótulos do filtro de status da tela. */
export function filtroStatusContaFinanceira(
  rotulos: Readonly<Record<string, string>>,
): FiltroStatus {
  return {
    opcoes: Object.entries(rotulos).map(([valor, rotulo]) => ({ valor, rotulo })),
  };
}

export const FILTROS_CONTA_FINANCEIRA: readonly FiltroGrid[] = [
  {
    tipo: 'periodo',
    rotulo: 'Vencimento',
    parametroDe: 'vencimentoDe',
    parametroAte: 'vencimentoAte',
  },
];

interface ContaFinanceiraGrid {
  numero: number;
  valor: string;
  dataVencimento: string;
}

/** Colunas "#", Descrição, a pessoa, Valor, Vencimento e Status (com "Vencido" calculado). */
export function colunasContaFinanceira<C extends ContaFinanceiraGrid>(
  pessoa: ColunaGrid<C>,
  statusExibicao: (conta: C) => string,
  rotulosStatus: Readonly<Record<string, string>>,
): ColunaGrid<C>[] {
  return [
    { id: 'id', titulo: '#', celula: (c) => c.numero, ocultavel: false },
    {
      id: 'descricao',
      titulo: 'Descricao',
      tituloCartao: true,
      ordenavel: true,
      exportavel: true,
      ocultavel: false,
    },
    pessoa,
    {
      id: 'valor',
      titulo: 'Valor',
      ordenavel: true,
      exportavel: true,
      celula: (c) => formatarMoeda(Number(c.valor)),
    },
    {
      id: 'dataVencimento',
      titulo: 'Vencimento',
      ordenavel: true,
      exportavel: true,
      celula: (c) => formatarData(c.dataVencimento),
    },
    {
      id: 'status',
      titulo: 'Status',
      ordenavel: true,
      exportavel: true,
      celula: (c) => <StatusContaFinanceira status={statusExibicao(c)} rotulos={rotulosStatus} />,
    },
  ];
}

export interface AcoesContaFinanceira {
  onDetalhar: () => void;
  onEditar: () => void;
  onExcluir: () => void;
  permissaoEditar: Permissao;
  permissaoExcluir: Permissao;
  /** Ações próprias da tela, entre "Detalhar" e "Editar" (ex.: Baixa). */
  extras?: AcaoLinha[];
}

/** Menu da linha: Detalhar, as ações próprias da tela, Editar e Excluir. */
export function acoesContaFinanceira({
  onDetalhar,
  onEditar,
  onExcluir,
  permissaoEditar,
  permissaoExcluir,
  extras = [],
}: AcoesContaFinanceira): AcaoLinha[] {
  return [
    { rotulo: 'Detalhar', icone: SearchIcon, onSelect: onDetalhar },
    ...extras,
    { rotulo: 'Editar', icone: PencilIcon, permissao: permissaoEditar, onSelect: onEditar },
    {
      rotulo: 'Excluir',
      icone: Trash2Icon,
      destrutiva: true,
      permissao: permissaoExcluir,
      onSelect: onExcluir,
    },
  ];
}
