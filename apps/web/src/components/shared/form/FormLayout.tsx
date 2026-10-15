import { AlertCircleIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { FormProvider, type FieldValues, type UseFormReturn } from 'react-hook-form';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { aplicarErroServidor, ERRO_SERVIDOR } from './erros-servidor';
import { FormAcoes } from './FormAcoes';

const COLUNAS = {
  1: 'grid gap-4',
  2: 'grid gap-4 sm:grid-cols-2',
  3: 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3',
} as const;

export interface FormLayoutProps<TIn extends FieldValues, TOut> {
  /** Criado com `useFormulario(schema, …)`. */
  form: UseFormReturn<TIn, unknown, TOut>;
  /**
   * Envia os dados já validados. Se rejeitar com `ApiRequestError`, o erro aparece no formulário:
   * `details` do 400 nos campos e os demais no topo. Use `mutateAsync` de uma mutation com
   * `meta: META_FORMULARIO` para não repetir o erro em toast.
   */
  onSubmit: (valores: TOut) => unknown;
  /** `FormField`s. Use `className="sm:col-span-2"` para ocupar a linha toda. */
  children: ReactNode;
  /** Necessário quando os botões ficam fora do `<form>` (ex.: rodapé do `Modal`). */
  id?: string;
  colunas?: keyof typeof COLUNAS;
  /** Botões do rodapé. Padrão: `FormAcoes` (Cancelar, se houver `onCancelar`, e Salvar). `null` omite. */
  acoes?: ReactNode;
  rotuloEnviar?: string;
  onCancelar?: () => void;
  className?: string;
}

/** Formulário padrão: React Hook Form + Zod, erros por campo e erro geral do servidor. */
export function FormLayout<TIn extends FieldValues, TOut>({
  form,
  onSubmit,
  children,
  id,
  colunas = 1,
  acoes,
  rotuloEnviar,
  onCancelar,
  className,
}: Readonly<FormLayoutProps<TIn, TOut>>) {
  const enviar = form.handleSubmit(async (valores) => {
    try {
      await onSubmit(valores);
    } catch (error) {
      aplicarErroServidor(form.setError, error);
    }
  });
  const erroGeral = form.formState.errors.root?.[ERRO_SERVIDOR]?.message;
  const rodape =
    acoes === undefined ? (
      <FormAcoes form={form} rotuloEnviar={rotuloEnviar} onCancelar={onCancelar} />
    ) : (
      acoes
    );

  return (
    <FormProvider {...form}>
      <form
        id={id}
        noValidate
        onSubmit={(evento) => {
          // Enter num campo durante o envio não envia de novo.
          if (form.formState.isSubmitting) evento.preventDefault();
          else void enviar(evento);
        }}
        className={cn('grid gap-6', className)}
      >
        {erroGeral && (
          <Alert variant="destructive">
            <AlertCircleIcon aria-hidden />
            <AlertTitle className="line-clamp-none">{erroGeral}</AlertTitle>
          </Alert>
        )}
        <div className={COLUNAS[colunas]}>{children}</div>
        {rodape}
      </form>
    </FormProvider>
  );
}
