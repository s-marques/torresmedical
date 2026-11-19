import {
  cancelarSalaBloqueioSchema,
  type CancelarSalaBloqueioInput,
  type SalaBloqueio,
} from '@torres/shared';
import { Loader2Icon, XCircleIcon } from 'lucide-react';
import { useFormState } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { periodoDoBloqueio } from './periodo-bloqueio';
import { useCancelarBloqueio } from './use-bloqueios-sala';

const ID_FORMULARIO = 'form-cancelar-bloqueio';

export interface ModalCancelarBloqueioProps {
  bloqueio: SalaBloqueio;
  onFechar: () => void;
}

/**
 * Confirmação do cancelamento (ação destrutiva) com o motivo obrigatório. O bloqueio não é
 * excluído: fica cancelado, com quem, quando e o motivo (critério de aceite da #138).
 */
export function ModalCancelarBloqueio({
  bloqueio,
  onFechar,
}: Readonly<ModalCancelarBloqueioProps>) {
  const { t } = useTranslation();
  const cancelar = useCancelarBloqueio(bloqueio.id);
  const form = useFormulario(cancelarSalaBloqueioSchema, { defaultValues: { motivo: '' } });
  const { isSubmitting } = useFormState({ control: form.control });

  async function confirmar(valores: CancelarSalaBloqueioInput) {
    await cancelar.mutateAsync(valores);
    onFechar();
  }

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={t('salasBloqueios.cancelar.titulo')}
      tamanho="md"
      className="[&_h2]:text-destructive"
      rodape={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onFechar}>
            {t('salasBloqueios.cancelar.voltar')}
          </Button>
          <Button
            type="submit"
            form={ID_FORMULARIO}
            variant="destructive"
            aria-disabled={isSubmitting}
            className={cn(isSubmitting && 'opacity-50')}
            onClick={(evento) => isSubmitting && evento.preventDefault()}
          >
            {isSubmitting ? (
              <Loader2Icon aria-hidden className="animate-spin" />
            ) : (
              <XCircleIcon aria-hidden />
            )}
            {t('salasBloqueios.cancelar.confirmar')}
          </Button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">
        {t('salasBloqueios.cancelar.descricao', {
          tipo: t(`salasBloqueios.tipos.${bloqueio.tipo}`),
          sala: bloqueio.salaNome,
          periodo: periodoDoBloqueio(bloqueio, t('salasBloqueios.ate')),
        })}
      </p>
      <FormLayout id={ID_FORMULARIO} form={form} acoes={null} onSubmit={confirmar}>
        <FormField
          name="motivo"
          label={t('salasBloqueios.cancelar.motivo')}
          tipo="textarea"
          placeholder={t('salasBloqueios.cancelar.placeholder')}
          obrigatorio
        />
      </FormLayout>
    </Modal>
  );
}
