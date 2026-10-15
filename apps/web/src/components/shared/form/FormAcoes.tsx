import { Loader2Icon } from 'lucide-react';
import { useFormState, type FieldValues, type UseFormReturn } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface FormAcoesProps<TIn extends FieldValues, TOut> {
  form: UseFormReturn<TIn, unknown, TOut>;
  /** `id` do `FormLayout`, quando os botões ficam fora do `<form>` (rodapé do `Modal`). */
  formId?: string;
  rotuloEnviar?: string;
  onCancelar?: () => void;
  className?: string;
}

/** Botões Cancelar/Salvar, com carregamento durante o envio. */
export function FormAcoes<TIn extends FieldValues, TOut>({
  form,
  formId,
  rotuloEnviar = 'Salvar',
  onCancelar,
  className,
}: Readonly<FormAcoesProps<TIn, TOut>>) {
  const { isSubmitting } = useFormState({ control: form.control });
  return (
    <div className={cn('flex flex-wrap justify-end gap-2', className)}>
      {onCancelar && (
        <Button type="button" variant="outline" onClick={onCancelar}>
          Cancelar
        </Button>
      )}
      {/* `aria-disabled` mantém o foco no botão durante o envio; cliques repetidos são ignorados. */}
      <Button
        type="submit"
        form={formId}
        aria-disabled={isSubmitting}
        aria-busy={isSubmitting}
        className={cn(isSubmitting && 'opacity-50')}
        onClick={(evento) => isSubmitting && evento.preventDefault()}
      >
        {isSubmitting && <Loader2Icon aria-hidden className="animate-spin" />}
        {rotuloEnviar}
      </Button>
    </div>
  );
}
