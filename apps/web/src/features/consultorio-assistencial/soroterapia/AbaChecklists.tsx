import {
  exportSoroterapiaEmAndamentoQuerySchema,
  exportSoroterapiaHistoricoQuerySchema,
  listSoroterapiaEmAndamentoQuerySchema,
  listSoroterapiaHistoricoQuerySchema,
  soroterapiaChecklistPageSchema,
  SOROTERAPIA_STATUS_HISTORICO,
  type SoroterapiaChecklist,
  type SoroterapiaStatus,
} from '@torres/shared';
import type { TFunction } from 'i18next';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, ExportacaoGrid, FiltroStatus } from '@/components/shared/data-grid/tipos';
import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';
import { formatarDataHora } from '@/lib/formatar';
import { URL_EM_ANDAMENTO, URL_HISTORICO } from './use-soroterapia';

const TOM: Record<SoroterapiaStatus, TomStatus> = {
  EM_ANDAMENTO: 'info',
  FINALIZADO: 'sucesso',
  SUSPENSO: 'alerta',
};

const PERMISSAO_EXPORTAR = 'consultorio-assistencial.soroterapia.exportar';

const EXPORTACAO_EM_ANDAMENTO: ExportacaoGrid = {
  permissao: PERMISSAO_EXPORTAR,
  nomeArquivo: 'soroterapia-em-andamento',
  schema: exportSoroterapiaEmAndamentoQuerySchema,
};

const EXPORTACAO_HISTORICO: ExportacaoGrid = {
  permissao: PERMISSAO_EXPORTAR,
  nomeArquivo: 'soroterapia-historico',
  schema: exportSoroterapiaHistoricoQuerySchema,
};

/** Colunas do inventário: Data, Paciente, Profissional, Protocolo, Sinais Vitais Inicio, Status e Duracao. */
function colunas(t: TFunction): ColunaGrid<SoroterapiaChecklist>[] {
  const titulo = (chave: string) => t(`soroterapia.checklists.colunas.${chave}`);
  return [
    {
      id: 'data',
      titulo: titulo('data'),
      ordenavel: true,
      exportavel: true,
      celula: (c) => formatarDataHora(c.data),
    },
    {
      id: 'paciente',
      titulo: titulo('paciente'),
      ordenavel: true,
      exportavel: true,
      celula: (c) => c.pacienteNome ?? '-',
    },
    {
      id: 'profissional',
      titulo: titulo('profissional'),
      ordenavel: true,
      exportavel: true,
      celula: (c) => c.profissionalNome ?? '-',
    },
    { id: 'protocolo', titulo: titulo('protocolo'), ordenavel: true, exportavel: true },
    {
      id: 'sinaisVitaisInicio',
      titulo: titulo('sinaisVitaisInicio'),
      exportavel: true,
      celula: (c) => c.sinaisVitaisInicio ?? '-',
    },
    {
      id: 'status',
      titulo: titulo('status'),
      ordenavel: true,
      exportavel: true,
      celula: (c) => (
        <StatusBadge tom={TOM[c.status]}>
          {t(`soroterapia.checklists.status.${c.status}`)}
        </StatusBadge>
      ),
    },
    {
      id: 'duracao',
      titulo: titulo('duracao'),
      exportavel: true,
      celula: (c) =>
        c.duracaoMinutos === null
          ? '-'
          : t('soroterapia.checklists.duracaoMinutos', { minutos: c.duracaoMinutos }),
    },
  ];
}

/**
 * Abas "Em Andamento" e "Historico": o mesmo grid. O Historico tem os chips Todos, Finalizado e
 * Suspenso (inventário).
 */
export function AbaChecklists({ historico }: Readonly<{ historico: boolean }>) {
  const { t } = useTranslation();
  const COLUNAS = useMemo(() => colunas(t), [t]);
  const status = useMemo<FiltroStatus | undefined>(
    () =>
      historico
        ? {
            opcoes: SOROTERAPIA_STATUS_HISTORICO.map((valor) => ({
              valor,
              rotulo: t(`soroterapia.checklists.status.${valor}`),
            })),
          }
        : undefined,
    [historico, t],
  );

  return (
    <DataGrid
      url={historico ? URL_HISTORICO : URL_EM_ANDAMENTO}
      schema={soroterapiaChecklistPageSchema}
      querySchema={
        historico ? listSoroterapiaHistoricoQuerySchema : listSoroterapiaEmAndamentoQuerySchema
      }
      colunas={COLUNAS}
      busca={t('soroterapia.checklists.buscar')}
      status={status}
      exportacao={historico ? EXPORTACAO_HISTORICO : EXPORTACAO_EM_ANDAMENTO}
      mensagemVazio={t('soroterapia.checklists.vazio')}
    />
  );
}
