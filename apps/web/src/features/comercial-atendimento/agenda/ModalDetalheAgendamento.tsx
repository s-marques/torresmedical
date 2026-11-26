import {
  AGENDAMENTO_STATUS_CANCELAVEIS,
  AGENDAMENTO_STATUS_ROTULOS,
  type Agendamento,
} from '@torres/shared';
import { PencilIcon, UserIcon, XCircleIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/shared/Modal';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { formatarData } from '@/lib/formatar';
import { cn } from '@/lib/utils';
import { diaLocal, horaLocal } from './agenda-datas';
import { COR_STATUS } from './agenda-status';

const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export interface ModalDetalheAgendamentoProps {
  agendamento: Agendamento;
  onFechar: () => void;
  /** Abre a edição (sala, data, hora e duração); só aparece com a permissão editar. */
  onEditar: (agendamento: Agendamento) => void;
  /** Abre o cancelamento com motivo (issue #162); só aparece com a permissão editar. */
  onCancelar: (agendamento: Agendamento) => void;
}

function Campo({ rotulo, children }: Readonly<{ rotulo: string; children: ReactNode }>) {
  return (
    <div className="grid gap-1">
      <dt className="text-muted-foreground text-sm">{rotulo}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

/**
 * Modal "Agendamento #N" aberto ao clicar num cartão da agenda (somente leitura).
 * Confirmar, Check-in, Faltou e Registrar Recebimento ficam para outras issues; o Cancelar tem motivo (#162); o Editar
 * troca sala, data, hora e duração (issue #136).
 */
export function ModalDetalheAgendamento({
  agendamento: a,
  onFechar,
  onEditar,
  onCancelar,
}: Readonly<ModalDetalheAgendamentoProps>) {
  const { t } = useTranslation();
  const valor = a.valor ?? 0;
  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={`Agendamento #${a.numero}`}
      rodape={
        <SePermitido permissao="comercial-atendimento.agenda.editar">
          <div className="flex flex-wrap justify-end gap-2">
            {AGENDAMENTO_STATUS_CANCELAVEIS.includes(a.status) && (
              <Button
                type="button"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => onCancelar(a)}
              >
                <XCircleIcon aria-hidden />
                {t('cancelamento.agenda.acao')}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onEditar(a)}>
              <PencilIcon aria-hidden />
              {t('agenda.detalhe.editar')}
            </Button>
          </div>
        </SePermitido>
      }
    >
      <div className="grid gap-4 pb-2">
        <div className="flex items-center gap-3">
          <span className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
            <UserIcon aria-hidden className="size-6" />
          </span>
          <div>
            <p className="text-lg font-semibold">{a.pacienteNome}</p>
            <p className="text-muted-foreground text-sm uppercase">{a.profissionalNome}</p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-4 rounded-lg border p-4">
          <Campo rotulo="Data">{formatarData(diaLocal(a.inicio))}</Campo>
          <Campo rotulo="Horário">{horaLocal(a.inicio)}</Campo>
          <Campo rotulo="Duração">{a.duracaoMinutos} min</Campo>
          <Campo rotulo={t('agenda.campos.sala')}>{a.salaNome ?? t('agenda.sala.semSala')}</Campo>
          <Campo rotulo="Status">
            <span
              className={cn(
                'inline-block rounded-full px-3 py-0.5 text-xs font-bold',
                COR_STATUS[a.status].pilula,
              )}
            >
              {AGENDAMENTO_STATUS_ROTULOS[a.status]}
            </span>
          </Campo>
          {a.tipoNome && <Campo rotulo="Tipo">{a.tipoNome}</Campo>}
          {valor > 0 && (
            <Campo rotulo="Valor">
              <span className="text-emerald-600">{MOEDA.format(valor)}</span>
            </Campo>
          )}
          {a.convenio && <Campo rotulo="Convênio">Sim</Campo>}
        </dl>

        {a.observacoes && (
          <div className="grid gap-1 rounded-lg border p-4">
            <p className="text-muted-foreground text-sm">Observações</p>
            <p className="whitespace-pre-line">{a.observacoes}</p>
          </div>
        )}

        {valor > 0 && (
          // Ainda não há recebimentos: tudo é "Pendente" até a tela de Registrar Recebimento existir.
          <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
            <div>
              <p className="text-muted-foreground text-sm">Pagamento</p>
              <p className="font-bold text-red-700 dark:text-red-300">Pendente</p>
            </div>
            <div className="text-right text-sm">
              <p className="text-muted-foreground">R$ 0.00 / R$ {valor.toFixed(2)}</p>
              <p className="font-bold text-orange-600">Restam R$ {valor.toFixed(2)}</p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
