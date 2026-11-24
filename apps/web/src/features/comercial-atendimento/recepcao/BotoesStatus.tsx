import {
  RECEPCAO_STATUS_ACAO,
  recepcaoPodeAlterar,
  type RecepcaoItem,
  type RecepcaoStatusAcao,
} from '@torres/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { useAlterarStatusRecepcao } from './use-recepcao';

/** Botões de status rápido da linha. "Cancelou" pede confirmação (ação destrutiva). */
export function BotoesStatus({ linha }: Readonly<{ linha: RecepcaoItem }>) {
  const { t } = useTranslation();
  const { mutateAsync: alterar, isPending } = useAlterarStatusRecepcao();
  const [cancelando, setCancelando] = useState(false);
  // Em atendimento ou finalizado é do médico: a recepção só acompanha.
  const travado = !recepcaoPodeAlterar(linha.status);

  function aplicar(status: RecepcaoStatusAcao) {
    if (status === 'CANCELADO') setCancelando(true);
    else void alterar({ id: linha.id, status });
  }

  return (
    <div className="flex flex-wrap justify-end gap-1">
      {RECEPCAO_STATUS_ACAO.map((status) => (
        <Button
          key={status}
          size="sm"
          variant={status === linha.status ? 'default' : 'outline'}
          disabled={travado || isPending || status === linha.status}
          aria-pressed={status === linha.status}
          aria-label={t('recepcao.botaoAria', {
            status: t(`recepcao.status.${status}`),
            paciente: linha.pacienteNome,
          })}
          onClick={() => aplicar(status)}
        >
          {t(`recepcao.status.${status}`)}
        </Button>
      ))}
      <ConfirmDialog
        aberto={cancelando}
        onAbertoChange={setCancelando}
        titulo={t('recepcao.cancelar.titulo')}
        descricao={t('recepcao.cancelar.descricao', { paciente: linha.pacienteNome })}
        rotuloConfirmar={t('recepcao.cancelar.confirmar')}
        onConfirmar={() => alterar({ id: linha.id, status: 'CANCELADO' })}
      />
    </div>
  );
}
