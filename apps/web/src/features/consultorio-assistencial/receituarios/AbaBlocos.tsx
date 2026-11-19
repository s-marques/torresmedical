import {
  exportReceituarioBlocosQuerySchema,
  formatarNumeracaoBloco,
  listReceituarioBlocosQuerySchema,
  RECEITUARIO_BLOCO_STATUS_ROTULOS,
  RECEITUARIO_TIPO_ROTULOS,
  receituarioBlocoPageSchema,
  type ReceituarioBloco,
} from '@torres/shared';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, ExportacaoGrid } from '@/components/shared/data-grid/tipos';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { FILTRO_STATUS_BLOCO, FILTRO_TIPO, TOM_STATUS_BLOCO, TOM_TIPO } from './opcoes';
import { URL_BLOCOS } from './use-receituarios';

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'consultorio-assistencial.receituarios.exportar',
  nomeArquivo: 'receituarios-blocos',
  schema: exportReceituarioBlocosQuerySchema,
};

/** Colunas do inventário: Tipo, Numeracao, Localizacao, Medico, Usados/Total e Status. */
const COLUNAS: ColunaGrid<ReceituarioBloco>[] = [
  {
    id: 'tipo',
    titulo: 'Tipo',
    ordenavel: true,
    exportavel: true,
    celula: (b) => (
      <StatusBadge tom={TOM_TIPO[b.tipo]}>{RECEITUARIO_TIPO_ROTULOS[b.tipo]}</StatusBadge>
    ),
  },
  {
    id: 'numeracao',
    titulo: 'Numeracao',
    exportavel: true,
    ocultavel: false,
    celula: (b) => <span className="font-mono">{formatarNumeracaoBloco(b)}</span>,
  },
  {
    id: 'localizacao',
    titulo: 'Localizacao',
    ordenavel: true,
    exportavel: true,
    celula: (b) => b.localizacao ?? '-',
  },
  {
    id: 'medico',
    titulo: 'Medico',
    ordenavel: true,
    exportavel: true,
    celula: (b) => b.profissionalNome ?? '-',
  },
  {
    id: 'usados',
    titulo: 'Usados/Total',
    exportavel: true,
    celula: (b) => `${b.usados}/${b.total}`,
  },
  {
    id: 'status',
    titulo: 'Status',
    ordenavel: true,
    exportavel: true,
    celula: (b) => (
      <StatusBadge tom={TOM_STATUS_BLOCO[b.status]}>
        {RECEITUARIO_BLOCO_STATUS_ROTULOS[b.status]}
      </StatusBadge>
    ),
  },
];

/** Aba "Blocos": talões de receituário controlado. Sem ações por linha no inventário. */
export function AbaBlocos() {
  return (
    <DataGrid
      url={URL_BLOCOS}
      schema={receituarioBlocoPageSchema}
      querySchema={listReceituarioBlocosQuerySchema}
      colunas={COLUNAS}
      busca="Buscar blocos..."
      filtros={[FILTRO_TIPO, FILTRO_STATUS_BLOCO]}
      exportacao={EXPORTACAO}
      mensagemVazio="Nenhum bloco encontrado."
    />
  );
}
