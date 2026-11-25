import {
  AGENDAMENTO_STATUS,
  listRecepcaoQuerySchema,
  RECEPCAO_ATUALIZACAO_MS,
  RECEPCAO_PAGE_SIZE,
  recepcaoPageSchema,
  type RecepcaoItem,
} from '@torres/shared';
import { CalendarIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, FiltroGrid } from '@/components/shared/data-grid/tipos';
import { PageHeader } from '@/components/shared/PageHeader';
import { horaLocal } from '@/features/comercial-atendimento/agenda/agenda-datas';
import { usePermissao } from '@/lib/auth/use-sessao';
import { formatarData } from '@/lib/formatar';
import { hojeISO } from '@/lib/datas';
import { BotoesStatus } from './BotoesStatus';
import { FilaEspera } from './FilaEspera';
import { StatusRecepcao } from './StatusRecepcao';
import { formatarEspera, minutosDeEspera, useAgora } from './espera';
import { URL_RECEPCAO } from './use-recepcao';

/**
 * Recepção (`/recepcao`, issue #147, R §7 e §12): "Atendimentos de hoje" para conduzir o dia, com
 * status rápidos que gravam o horário de cada transição, a fila de espera e atualização
 * automática (agendamentos criados em outra estação ou pela IA aparecem sem recarregar).
 * Não mostra nenhum conteúdo clínico.
 */
export default function RecepcaoPage() {
  const { t } = useTranslation();
  const podeEditar = usePermissao('comercial-atendimento.recepcao.editar');
  const agora = useAgora();

  const filtros = useMemo(
    (): readonly FiltroGrid[] => [
      {
        tipo: 'entidade',
        parametro: 'profissionalId',
        rotulo: t('recepcao.filtros.profissional'),
        entidade: 'profissionais',
        rotuloTodos: t('recepcao.filtros.todosProfissionais'),
      },
      {
        tipo: 'entidade',
        parametro: 'salaId',
        rotulo: t('recepcao.filtros.sala'),
        entidade: 'salas',
        rotuloTodos: t('recepcao.filtros.todasSalas'),
      },
      {
        tipo: 'select',
        parametro: 'status',
        rotulo: t('recepcao.filtros.status'),
        rotuloTodos: t('recepcao.filtros.todosStatus'),
        opcoes: AGENDAMENTO_STATUS.map((status) => ({
          valor: status,
          rotulo: t(`recepcao.status.${status}`),
        })),
      },
    ],
    [t],
  );

  const colunas = useMemo(
    (): ColunaGrid<RecepcaoItem>[] => [
      {
        id: 'inicio',
        titulo: t('recepcao.colunas.horario'),
        ordenavel: true,
        celula: (linha) => <span className="font-semibold">{horaLocal(linha.inicio)}</span>,
      },
      {
        id: 'pacienteNome',
        tituloCartao: true,
        titulo: t('recepcao.colunas.paciente'),
        ordenavel: 'paciente',
        celula: (linha) => <span className="font-medium">{linha.pacienteNome}</span>,
      },
      {
        id: 'profissionalNome',
        titulo: t('recepcao.colunas.profissional'),
        ordenavel: 'profissional',
      },
      { id: 'salaNome', titulo: t('recepcao.colunas.sala'), ordenavel: 'sala' },
      {
        id: 'status',
        titulo: t('recepcao.colunas.status'),
        celula: (linha) => <StatusRecepcao status={linha.status} />,
      },
      {
        id: 'chegadaEm',
        titulo: t('recepcao.colunas.chegada'),
        celula: (linha) => (linha.chegadaEm ? horaLocal(linha.chegadaEm) : '-'),
      },
      {
        id: 'espera',
        titulo: t('recepcao.colunas.espera'),
        celula: (linha) => {
          const minutos = minutosDeEspera(linha, agora);
          return minutos === null ? '-' : formatarEspera(minutos);
        },
      },
      {
        id: 'entradaEm',
        titulo: t('recepcao.colunas.entrada'),
        oculta: true,
        celula: (linha) => (linha.entradaEm ? horaLocal(linha.entradaEm) : '-'),
      },
      {
        id: 'finalizadoEm',
        titulo: t('recepcao.colunas.fim'),
        oculta: true,
        celula: (linha) => (linha.finalizadoEm ? horaLocal(linha.finalizadoEm) : '-'),
      },
      ...(podeEditar
        ? [
            {
              id: 'acoes',
              titulo: t('recepcao.colunas.acoes'),
              ocultavel: false,
              className: 'text-right',
              celula: (linha: RecepcaoItem) => <BotoesStatus linha={linha} />,
            } satisfies ColunaGrid<RecepcaoItem>,
          ]
        : []),
    ],
    [t, agora, podeEditar],
  );

  const hoje = hojeISO();

  return (
    <div className="grid gap-6">
      <PageHeader titulo={t('recepcao.titulo')} descricao={t('recepcao.descricao')} />
      <FilaEspera />
      <DataGrid
        url={URL_RECEPCAO}
        schema={recepcaoPageSchema}
        querySchema={listRecepcaoQuerySchema}
        colunas={colunas}
        busca={false}
        filtros={filtros}
        tamanhosPagina={[RECEPCAO_PAGE_SIZE]}
        atualizacaoMs={RECEPCAO_ATUALIZACAO_MS}
        mensagemVazio={t('recepcao.vazio')}
        resumo={(meta) => (
          <span className="flex items-center gap-1.5">
            <CalendarIcon aria-hidden className="size-4" />
            {t('recepcao.resumo', { data: formatarData(hoje), total: meta.total })}
          </span>
        )}
      />
    </div>
  );
}
