import type { BaixaInsumo } from '@torres/shared';
import type { ColunaGrid } from '@/components/shared/data-grid/tipos';
import { formatarDataHora } from '@/lib/formatar';

const resumoItens = (b: BaixaInsumo) =>
  b.itens.map((i) => `${i.produtoNome} (${Number(i.quantidade)})`).join(', ');

/**
 * Colunas do grid de baixas: Data, Paciente, Profissional, Unidade, Itens e Responsável.
 * O inventário não mostra o grid (lista vazia); as colunas foram sugeridas pela IA e
 * aceitas pelo dev na issue #17.
 */
export const COLUNAS_BAIXAS_INSUMOS: ColunaGrid<BaixaInsumo>[] = [
  {
    id: 'data',
    titulo: 'Data',
    ordenavel: true,
    ocultavel: false,
    celula: (b) => formatarDataHora(b.createdAt),
  },
  {
    id: 'paciente',
    titulo: 'Paciente',
    ordenavel: true,
    celula: (b) => b.pacienteNome ?? '—',
  },
  {
    id: 'profissional',
    titulo: 'Profissional',
    ordenavel: true,
    celula: (b) => b.profissionalNome ?? '—',
  },
  { id: 'unidade', titulo: 'Unidade', ordenavel: true, celula: (b) => b.unidadeNome ?? '—' },
  { id: 'itens', titulo: 'Itens', celula: resumoItens },
  { id: 'responsavel', titulo: 'Responsável', celula: (b) => b.responsavelNome ?? '—' },
];
