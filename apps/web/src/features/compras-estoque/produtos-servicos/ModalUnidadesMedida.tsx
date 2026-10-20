import { createUnidadeMedidaSchema } from '@torres/shared';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useIncluirUnidadeMedida, useUnidadesMedida } from './use-produtos';

const ID_FORMULARIO = 'form-unidade-medida';

/** Modal "Unidades de Medida": lista as cadastradas e inclui uma nova (Nome e Sigla). */
export function ModalUnidadesMedida({ onFechar }: Readonly<{ onFechar: () => void }>) {
  const unidades = useUnidadesMedida();
  const incluir = useIncluirUnidadeMedida();
  const form = useFormulario(createUnidadeMedidaSchema, {
    defaultValues: { nome: '', sigla: '' },
  });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Unidades de Medida"
      rodape={
        <Button type="submit" form={ID_FORMULARIO} disabled={form.formState.isSubmitting}>
          Incluir
        </Button>
      }
    >
      <div className="grid gap-6">
        <ul aria-label="Unidades cadastradas" className="grid gap-1 text-sm">
          {unidades.data?.data.map((unidade) => (
            <li key={unidade.id} className="rounded-md border px-3 py-2">
              {unidade.label}
            </li>
          ))}
          {unidades.data?.data.length === 0 && (
            <li className="text-muted-foreground">Nenhuma unidade cadastrada.</li>
          )}
        </ul>
        <FormLayout
          id={ID_FORMULARIO}
          form={form}
          acoes={null}
          colunas={2}
          onSubmit={async (valores) => {
            await incluir.mutateAsync(valores);
            form.reset();
          }}
        >
          <FormField name="nome" label="Nome" placeholder="Ex: Mililitro" />
          <FormField name="sigla" label="Sigla" placeholder="Ex: ML" />
        </FormLayout>
      </div>
    </Modal>
  );
}
