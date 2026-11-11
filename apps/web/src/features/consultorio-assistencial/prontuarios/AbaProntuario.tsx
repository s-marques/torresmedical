import { prontuarioInputSchema, type Prontuario, type ProntuarioFormulario } from '@torres/shared';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useProntuario, useSalvarProntuario } from './use-prontuarios';

const ID_FORMULARIO = 'form-prontuario';

function valoresIniciais(prontuario?: Prontuario): ProntuarioFormulario {
  return {
    alergias: prontuario?.alergias ?? '',
    medicamentosEmUso: prontuario?.medicamentosEmUso ?? '',
    doencasCronicas: prontuario?.doencasCronicas ?? '',
    cirurgiasAnteriores: prontuario?.cirurgiasAnteriores ?? '',
    historicoFamiliar: prontuario?.historicoFamiliar ?? '',
    observacoes: prontuario?.observacoes ?? '',
  };
}

export interface AbaProntuarioProps {
  pacienteId: string;
}

/** Aba "Prontuário": informações gerais de saúde, salvas num único registro por paciente. */
export function AbaProntuario({ pacienteId }: Readonly<AbaProntuarioProps>) {
  const { data: prontuario, isPending } = useProntuario(pacienteId);
  const salvar = useSalvarProntuario(pacienteId);

  if (isPending) return <Skeleton className="h-96 w-full" aria-label="Carregando" />;

  return (
    <ProntuarioForm key={prontuario?.updatedAt ?? 'novo'} prontuario={prontuario} salvar={salvar} />
  );
}

function ProntuarioForm({
  prontuario,
  salvar,
}: Readonly<{
  prontuario: Prontuario | undefined;
  salvar: ReturnType<typeof useSalvarProntuario>;
}>) {
  const form = useFormulario(prontuarioInputSchema, { defaultValues: valoresIniciais(prontuario) });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prontuário Médico</CardTitle>
        <p className="text-sm text-muted-foreground">Informações gerais de saúde do paciente.</p>
      </CardHeader>
      <CardContent>
        <FormLayout
          id={ID_FORMULARIO}
          form={form}
          colunas={2}
          rotuloEnviar="Salvar"
          onSubmit={(valores) => salvar.mutateAsync(valores)}
        >
          <FormField
            name="alergias"
            label="Alergias"
            tipo="textarea"
            placeholder="Alergias conhecidas…"
          />
          <FormField
            name="medicamentosEmUso"
            label="Medicamentos em Uso"
            tipo="textarea"
            placeholder="Medicamentos em uso contínuo…"
          />
          <FormField
            name="doencasCronicas"
            label="Doenças Crônicas"
            tipo="textarea"
            placeholder="Doenças crônicas diagnosticadas…"
          />
          <FormField
            name="cirurgiasAnteriores"
            label="Cirurgias Anteriores"
            tipo="textarea"
            placeholder="Cirurgias realizadas anteriormente…"
          />
          <FormField
            name="historicoFamiliar"
            label="Histórico Familiar"
            tipo="textarea"
            placeholder="Histórico de doenças na família…"
            className="col-span-full"
          />
          <FormField
            name="observacoes"
            label="Observações"
            tipo="textarea"
            placeholder="Observações gerais…"
            className="col-span-full"
          />
        </FormLayout>
      </CardContent>
    </Card>
  );
}
