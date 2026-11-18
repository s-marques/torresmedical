import {
  CONFIRMACAO_ETAPAS,
  CONFIRMACAO_STATUS_ROTULO,
  confirmacaoPageSchema,
  exportConfirmacoesQuerySchema,
  listConfirmacoesQuerySchema,
  type Confirmacao,
  type ConfirmacaoEnvio,
  type ConfirmacaoEtapa,
  type ConfirmacaoStatus,
} from '@torres/shared';
import { CheckCircle2Icon, SendIcon, XCircleIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, ExportacaoGrid } from '@/components/shared/data-grid/tipos';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatarDataHoraCurta, formatarHora } from './formatar';
import { URL_CONFIRMACOES, useAcaoConfirmacao } from './use-confirmacoes';

const PERMISSAO_EDITAR = 'comercial-atendimento.confirmacoes.editar' as const;

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'comercial-atendimento.confirmacoes.exportar',
  nomeArquivo: 'confirmacoes',
  schema: exportConfirmacoesQuerySchema,
};

const TOM_STATUS: Record<ConfirmacaoStatus, TomStatus> = {
  PENDENTE: 'neutro',
  CONFIRMADO: 'sucesso',
  CANCELADO: 'perigo',
};

const ROTULO_ETAPA: Record<ConfirmacaoEtapa, string> = {
  MSG1: 'MSG1',
  MSG2: 'MSG2',
  MSG3: 'MSG3',
  LEMBRETE: 'Lembrete',
};

/** MSG1/MSG2/MSG3: destacada (com o horário) quando já saiu. */
function Etapas({ envios }: Readonly<{ envios: ConfirmacaoEnvio[] }>) {
  return (
    <div className="flex gap-2">
      {CONFIRMACAO_ETAPAS.filter((e) => e !== 'LEMBRETE').map((etapa, i) => {
        const envio = envios.find((e) => e.etapa === etapa && e.status === 'ENVIADO');
        return (
          <div key={etapa} className="grid gap-0.5">
            <span
              data-enviada={envio ? 'true' : 'false'}
              className={cn(
                'rounded-md px-2 py-0.5 text-xs font-medium',
                envio
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                  : 'bg-muted',
              )}
            >
              {ROTULO_ETAPA[etapa]}
            </span>
            {envio && (
              <span className="text-xs text-muted-foreground">
                M{i + 1}: {formatarHora(envio.enviadoEm)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

type AlvoAcao = { acao: 'confirmar' | 'cancelar'; confirmacao: Confirmacao };

/** Aba Pendentes: agendamentos do dia, com as ações de enviar, confirmar e cancelar. */
export function AbaPendentes({ dataEnvio }: Readonly<{ dataEnvio: string }>) {
  const [alvo, setAlvo] = useState<AlvoAcao | null>(null);
  const enviar = useAcaoConfirmacao('enviar');
  const confirmar = useAcaoConfirmacao('confirmar');
  const cancelar = useAcaoConfirmacao('cancelar');

  // O grid recria as linhas quando o array de colunas muda: memoizado.
  const { mutate: enviarConfirmacao, isPending: enviando } = enviar;
  const colunas = useMemo<ColunaGrid<Confirmacao>[]>(
    () => [
      {
        id: 'enviadoEm',
        titulo: 'Enviado em',
        exportavel: true,
        celula: (c) =>
          c.enviadoEm ? (
            formatarDataHoraCurta(c.enviadoEm)
          ) : (
            <span className="text-muted-foreground">Não enviado</span>
          ),
      },
      {
        id: 'agendamento',
        titulo: 'Agendamento',
        ordenavel: true,
        exportavel: true,
        celula: (c) => (
          <div className="grid">
            <span className="font-medium">{formatarDataHoraCurta(c.inicio)}</span>
            {c.tipo && <span className="text-xs text-muted-foreground">{c.tipo}</span>}
          </div>
        ),
      },
      {
        id: 'paciente',
        titulo: 'Paciente',
        ordenavel: true,
        exportavel: true,
        celula: (c) => (
          <div className="grid">
            <span className="font-medium">{c.paciente}</span>
            {c.telefone && <span className="text-xs text-muted-foreground">{c.telefone}</span>}
          </div>
        ),
      },
      { id: 'profissional', titulo: 'Profissional', ordenavel: true, exportavel: true },
      {
        id: 'envios',
        titulo: 'Confirmações Enviadas',
        exportavel: true,
        celula: (c) => <Etapas envios={c.envios} />,
      },
      {
        id: 'status',
        titulo: 'Status',
        ordenavel: true,
        exportavel: true,
        celula: (c) => (
          <StatusBadge tom={TOM_STATUS[c.status]}>
            {CONFIRMACAO_STATUS_ROTULO[c.status]}
          </StatusBadge>
        ),
      },
      {
        id: 'acoes',
        titulo: 'Acoes',
        ocultavel: false,
        celula: (c) => (
          <SePermitido permissao={PERMISSAO_EDITAR}>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Enviar confirmacao"
                title="Enviar confirmacao"
                disabled={c.status !== 'PENDENTE' || enviando}
                onClick={() => enviarConfirmacao(c.id)}
              >
                <SendIcon aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Confirmar"
                title="Confirmar"
                className="text-emerald-600"
                disabled={c.status !== 'PENDENTE'}
                onClick={() => setAlvo({ acao: 'confirmar', confirmacao: c })}
              >
                <CheckCircle2Icon aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Cancelar"
                title="Cancelar"
                className="text-destructive"
                disabled={c.status === 'CANCELADO'}
                onClick={() => setAlvo({ acao: 'cancelar', confirmacao: c })}
              >
                <XCircleIcon aria-hidden />
              </Button>
            </div>
          </SePermitido>
        ),
      },
    ],
    [enviarConfirmacao, enviando],
  );

  const descricao = alvo
    ? `${alvo.acao === 'confirmar' ? 'Confirmar' : 'Cancelar'} o agendamento de ${alvo.confirmacao.paciente} em ${formatarDataHoraCurta(alvo.confirmacao.inicio)}?`
    : undefined;

  return (
    <>
      <DataGrid
        url={URL_CONFIRMACOES}
        schema={confirmacaoPageSchema}
        querySchema={listConfirmacoesQuerySchema}
        consultaFixa={{ dataEnvio }}
        colunas={colunas}
        busca="Buscar paciente..."
        exportacao={EXPORTACAO}
        mensagemVazio="Nenhum agendamento para esta data."
        resumo={(meta) => `${meta.total} linha(s) no total.`}
      />
      <ConfirmDialog
        aberto={alvo !== null}
        onAbertoChange={(aberto) => aberto || setAlvo(null)}
        titulo={alvo?.acao === 'confirmar' ? 'Confirmar Agendamento' : 'Cancelar Agendamento'}
        descricao={descricao}
        rotuloConfirmar={alvo?.acao === 'confirmar' ? 'Confirmar' : 'Cancelar'}
        destrutivo={alvo?.acao !== 'confirmar'}
        onConfirmar={() => {
          if (!alvo) return undefined;
          const mutation = alvo.acao === 'confirmar' ? confirmar : cancelar;
          return mutation.mutateAsync(alvo.confirmacao.id);
        }}
      />
    </>
  );
}
