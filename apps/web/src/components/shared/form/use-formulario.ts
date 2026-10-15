import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type FieldValues, type UseFormProps, type UseFormReturn } from 'react-hook-form';
import type { z } from 'zod';

/**
 * React Hook Form com o schema Zod de `@torres/shared` (`zodResolver`). Valida cada campo ao
 * sair dele e, depois do primeiro envio, a cada alteração. O `onSubmit` recebe a saída do schema.
 *
 * `const form = useFormulario(createUnidadeSchema, { defaultValues: { nome: '' } })`.
 */
export function useFormulario<TIn extends FieldValues, TOut extends FieldValues>(
  schema: z.ZodType<TOut, TIn>,
  options: Omit<UseFormProps<TIn, unknown, TOut>, 'resolver'> = {},
): UseFormReturn<TIn, unknown, TOut> {
  return useForm<TIn, unknown, TOut>({
    resolver: zodResolver<TIn, unknown, TOut>(schema),
    mode: 'onTouched',
    ...options,
  });
}
