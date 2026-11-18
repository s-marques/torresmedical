import {
  NPS_CLASSIFICACAO_ROTULO,
  NPS_CLASSIFICACOES,
  NPS_STATUS_ROTULO,
  listPesquisasNpsQuerySchema,
  pesquisaNpsPageSchema,
  type NpsClassificacao,
  type NpsStatus,
  type PesquisaNps,
} from '@torres/shared';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, FiltroStatus } from '@/components/shared/data-grid/tipos';
import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';
import { formatarDataHora } from './periodo';
import { URL_PESQUISA_NPS } from './use-pesquisa-nps';

const TOM_CLASSIFICACAO: Record<NpsClassificacao, TomStatus> = {
  PROMOTOR: 'sucesso',
  NEUTRO: 'alerta',
  DETRATOR: 'perigo',
};

const TOM_STATUS: Record<NpsStatus, TomStatus> = {
  ENVIADA: 'neutro',
  RESPONDIDA: 'sucesso',
  FALHA: 'perigo',
};

const FILTRO_CLASSIFICACAO: FiltroStatus = {
  parametro: 'classificacao',
  opcoes: NPS_CLASSIFICACOES.map((valor) => ({ valor, rotulo: NPS_CLASSIFICACAO_ROTULO[valor] })),
};

const COLUNAS: ColunaGrid<PesquisaNps>[] = [
  {
    id: 'enviadaEm',
    titulo: 'Enviada em',
    ordenavel: true,
    celula: (p) => formatarDataHora(p.enviadaEm),
  },
  { id: 'paciente', titulo: 'Paciente', ordenavel: true, ocultavel: false },
  { id: 'profissional', titulo: 'Profissional', ordenavel: true },
  {
    id: 'nota',
    titulo: 'Nota',
    ordenavel: true,
    celula: (p) =>
      p.nota === null ? (
        <span className="text-muted-foreground">-</span>
      ) : (
        <span className="font-medium">{p.nota}</span>
      ),
  },
  {
    id: 'classificacao',
    titulo: 'Classificação',
    celula: (p) =>
      p.classificacao ? (
        <StatusBadge tom={TOM_CLASSIFICACAO[p.classificacao]}>
          {NPS_CLASSIFICACAO_ROTULO[p.classificacao]}
        </StatusBadge>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  { id: 'comentario', titulo: 'Comentário', className: 'max-w-xs truncate' },
  {
    id: 'respondidaEm',
    titulo: 'Respondida em',
    ordenavel: true,
    celula: (p) => (p.respondidaEm ? formatarDataHora(p.respondidaEm) : '-'),
  },
  {
    id: 'status',
    titulo: 'Status',
    celula: (p) => (
      <StatusBadge tom={TOM_STATUS[p.status]}>{NPS_STATUS_ROTULO[p.status]}</StatusBadge>
    ),
  },
];

/** Aba Respostas: pesquisas enviadas no período (o mesmo De/Até do Dashboard). */
export function AbaRespostas({ de, ate }: Readonly<{ de: string; ate: string }>) {
  return (
    <DataGrid
      url={URL_PESQUISA_NPS}
      schema={pesquisaNpsPageSchema}
      querySchema={listPesquisasNpsQuerySchema}
      consultaFixa={{ de, ate }}
      colunas={COLUNAS}
      busca="Buscar paciente ou profissional..."
      status={FILTRO_CLASSIFICACAO}
      mensagemVazio="Nenhuma pesquisa encontrada no periodo."
    />
  );
}
