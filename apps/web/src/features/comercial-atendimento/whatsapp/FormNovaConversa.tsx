import { novaConversaWhatsappSchema, type LookupItem } from '@torres/shared';
import { useController, useFormContext } from 'react-hook-form';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Button } from '@/components/ui/button';
import { Chip, PontoCanal } from './Chip';
import { useNovaConversa } from './use-whatsapp';

interface ValoresNovaConversa {
  pacienteId: string | null;
  canalId: string | null;
}

export interface FormNovaConversaProps {
  canais: readonly LookupItem[];
  onFechar: () => void;
}

/** "Nova conversa" (botão Nova): paciente, canal, "Iniciar conversa" e "Cancelar". */
export function FormNovaConversa({ canais, onFechar }: Readonly<FormNovaConversaProps>) {
  const form = useFormulario<ValoresNovaConversa, { pacienteId: string; canalId: string }>(
    novaConversaWhatsappSchema,
    { defaultValues: { pacienteId: null, canalId: null }, mode: 'onChange' },
  );
  const novaConversa = useNovaConversa();

  return (
    <section
      aria-labelledby="nova-conversa-titulo"
      className="mx-4 mb-3 rounded-lg border bg-muted/40 p-3"
    >
      <h2 id="nova-conversa-titulo" className="mb-3 text-sm font-medium">
        Nova conversa
      </h2>
      <FormLayout
        form={form}
        className="gap-3"
        onSubmit={async (valores) => {
          await novaConversa.mutateAsync(valores);
          onFechar();
        }}
        acoes={
          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={!form.formState.isValid || form.formState.isSubmitting}
            >
              Iniciar conversa
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onFechar}>
              Cancelar
            </Button>
          </div>
        }
      >
        <FormField
          name="pacienteId"
          label="Paciente"
          tipo="entidade"
          entidade="pacientes"
          placeholder="Buscar paciente (nome, telefone, CPF)"
          obrigatorio
        />
        <CampoCanal canais={canais} />
      </FormLayout>
    </section>
  );
}

/** Canal da nova conversa, em chips (sem "Todos"). */
function CampoCanal({ canais }: Readonly<{ canais: readonly LookupItem[] }>) {
  const { control } = useFormContext<ValoresNovaConversa>();
  const { field, fieldState } = useController({ name: 'canalId', control });
  return (
    <div className="grid gap-2">
      <div role="group" aria-labelledby="nova-conversa-canal" className="flex flex-wrap gap-1.5">
        <span id="nova-conversa-canal" className="w-full text-xs text-muted-foreground">
          Canal:
        </span>
        {canais.map((canal) => (
          <Chip
            key={canal.id}
            tamanho="sm"
            ativo={field.value === canal.id}
            onClick={() => field.onChange(canal.id)}
          >
            <PontoCanal />
            {canal.label}
          </Chip>
        ))}
      </div>
      {fieldState.error && <p className="text-sm text-destructive">{fieldState.error.message}</p>}
    </div>
  );
}
