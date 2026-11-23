import {
  PESQUISA_PROFISSIONAL_STATUS,
  listPesquisasProfissionalQuerySchema,
  pesquisaProfissionalPageSchema,
  type PesquisaProfissional,
  type PesquisaProfissionalStatus,
} from '@torres/shared';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, FiltroStatus } from '@/components/shared/data-grid/tipos';
import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';
import { formatarDataHora } from '@/lib/formatar';
import {
  URL_PESQUISA_PROFISSIONAL,
  type FiltroPesquisaProfissional,
} from './use-pesquisa-profissional';

const TOM_STATUS: Record<PesquisaProfissionalStatus, TomStatus> = {
  ENVIADA: 'neutro',
  RESPONDIDA: 'sucesso',
  FALHA: 'perigo',
};

const VAZIO = <span className="text-muted-foreground">-</span>;
const nota = (valor: number | null) => (valor === null ? VAZIO : valor);

/** Aba Respostas: pesquisas enviadas no período (o mesmo De/Até e profissional dos Resultados). */
export function AbaRespostas({ de, ate, profissionalId }: Readonly<FiltroPesquisaProfissional>) {
  const { t } = useTranslation();
  const c = (chave: string) => t(`pesquisaProfissional.respostas.colunas.${chave}`);

  const colunas = useMemo<ColunaGrid<PesquisaProfissional>[]>(
    () => [
      {
        id: 'enviadaEm',
        titulo: c('enviadaEm'),
        ordenavel: true,
        celula: (p) => formatarDataHora(p.enviadaEm),
      },
      { id: 'profissional', titulo: c('profissional'), ordenavel: true, ocultavel: false },
      {
        id: 'tipo',
        titulo: c('tipo'),
        celula: (p) => t(`pesquisaProfissional.tipos.${p.tipo}`),
      },
      { id: 'notaEstrutura', titulo: c('estrutura'), celula: (p) => nota(p.notaEstrutura) },
      { id: 'notaRecepcao', titulo: c('recepcao'), celula: (p) => nota(p.notaRecepcao) },
      { id: 'notaAgenda', titulo: c('agenda'), celula: (p) => nota(p.notaAgenda) },
      { id: 'notaAtendimento', titulo: c('atendimento'), celula: (p) => nota(p.notaAtendimento) },
      {
        id: 'nps',
        titulo: c('nps'),
        ordenavel: true,
        celula: (p) => (p.nps === null ? VAZIO : <span className="font-medium">{p.nps}</span>),
      },
      { id: 'comentario', titulo: c('comentario'), className: 'max-w-xs truncate' },
      {
        id: 'respondidaEm',
        titulo: c('respondidaEm'),
        ordenavel: true,
        celula: (p) => (p.respondidaEm ? formatarDataHora(p.respondidaEm) : '-'),
      },
      {
        id: 'status',
        titulo: c('status'),
        celula: (p) => (
          <StatusBadge tom={TOM_STATUS[p.status]}>
            {t(`pesquisaProfissional.status.${p.status}`)}
          </StatusBadge>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `c` só depende de `t`
    [t],
  );

  const status = useMemo<FiltroStatus>(
    () => ({
      opcoes: PESQUISA_PROFISSIONAL_STATUS.map((valor) => ({
        valor,
        rotulo: t(`pesquisaProfissional.status.${valor}`),
      })),
    }),
    [t],
  );

  return (
    <DataGrid
      url={URL_PESQUISA_PROFISSIONAL}
      schema={pesquisaProfissionalPageSchema}
      querySchema={listPesquisasProfissionalQuerySchema}
      consultaFixa={{ de, ate, ...(profissionalId ? { profissionalId } : {}) }}
      colunas={colunas}
      busca={t('pesquisaProfissional.respostas.buscar')}
      status={status}
      mensagemVazio={t('pesquisaProfissional.respostas.vazio')}
    />
  );
}
