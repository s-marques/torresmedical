import {
  exportPrescricoesQuerySchema,
  formatarNumeroReceita,
  listPrescricoesQuerySchema,
  prescricaoPageSchema,
  RECEITUARIO_TIPO_ROTULOS,
  type Prescricao,
} from '@torres/shared';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, ExportacaoGrid, FiltroGrid } from '@/components/shared/data-grid/tipos';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { formatarData } from '@/lib/formatar';
import { FILTRO_TIPO, TOM_TIPO } from './opcoes';
import { URL_PRESCRICOES } from './use-receituarios';

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'consultorio-assistencial.receituarios.exportar',
  nomeArquivo: 'receituarios-prescricoes',
  schema: exportPrescricoesQuerySchema,
};

/** Filtros do print da aba: tipo e período De/Até. */
const FILTROS: readonly FiltroGrid[] = [
  FILTRO_TIPO,
  { tipo: 'periodo', rotulo: 'Data', parametroDe: 'de', parametroAte: 'ate' },
];

/** Colunas do print da aba: N Receita, Tipo, Paciente, Medico, Medicacao e Data. */
const COLUNAS: ColunaGrid<Prescricao>[] = [
  {
    id: 'numero',
    titulo: 'N Receita',
    ordenavel: true,
    exportavel: true,
    ocultavel: false,
    celula: (p) => <span className="font-mono">{formatarNumeroReceita(p.numero)}</span>,
  },
  {
    id: 'tipo',
    titulo: 'Tipo',
    ordenavel: true,
    exportavel: true,
    celula: (p) => (
      <StatusBadge tom={TOM_TIPO[p.tipo]}>{RECEITUARIO_TIPO_ROTULOS[p.tipo]}</StatusBadge>
    ),
  },
  {
    id: 'paciente',
    titulo: 'Paciente',
    ordenavel: true,
    exportavel: true,
    celula: (p) => p.pacienteNome ?? '-',
  },
  {
    id: 'medico',
    titulo: 'Medico',
    ordenavel: true,
    exportavel: true,
    celula: (p) => p.profissionalNome ?? '-',
  },
  {
    id: 'medicacao',
    titulo: 'Medicacao',
    ordenavel: true,
    exportavel: true,
    className: 'max-w-80',
    celula: (p) => (
      <span className="line-clamp-2" title={p.posologia ?? undefined}>
        {p.medicacao}
      </span>
    ),
  },
  {
    id: 'dataPrescricao',
    titulo: 'Data',
    ordenavel: true,
    exportavel: true,
    celula: (p) => formatarData(p.dataPrescricao),
  },
];

/** Aba "Prescricoes": receitas emitidas nos blocos. */
export function AbaPrescricoes() {
  return (
    <DataGrid
      url={URL_PRESCRICOES}
      schema={prescricaoPageSchema}
      querySchema={listPrescricoesQuerySchema}
      colunas={COLUNAS}
      busca="Buscar prescricoes..."
      filtros={FILTROS}
      exportacao={EXPORTACAO}
      mensagemVazio="Nenhuma prescricao encontrada."
    />
  );
}
