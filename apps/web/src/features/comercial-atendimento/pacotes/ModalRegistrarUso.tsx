import { registrarUsoPacoteSchema, type Pacote } from '@torres/shared';
import { CircleCheckIcon } from 'lucide-react';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/ui/button';
import { useRegistrarUso } from './use-pacotes';

const ID_FORMULARIO = 'form-registrar-uso';

export interface ModalRegistrarUsoProps {
  pacote: Pacote;
  onFechar: () => void;
}

/** Modal "Registrar Uso de Sessão", aberto pelo "Usar Sessão" do detalhe do pacote. */
export function ModalRegistrarUso({ pacote, onFechar }: Readonly<ModalRegistrarUsoProps>) {
  const registrar = useRegistrarUso(pacote.id);
  const form = useFormulario(registrarUsoPacoteSchema, {
    defaultValues: {
      profissionalId: null as unknown as string /* vazio até escolher */,
      quantidade: 1,
      observacoes: '',
    },
  });
  const { isSubmitting } = form.formState;

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Registrar Uso de Sessão"
      tamanho="sm"
      rodape={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form={ID_FORMULARIO}
            aria-disabled={isSubmitting}
            aria-busy={isSubmitting}
            onClick={(evento) => isSubmitting && evento.preventDefault()}
          >
            <CircleCheckIcon aria-hidden />
            Confirmar Uso
          </Button>
        </div>
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await registrar.mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField
          name="profissionalId"
          label="Profissional"
          tipo="entidade"
          entidade="profissionais"
          placeholder="Selecione o profissional"
          obrigatorio
        />
        <FormField
          name="quantidade"
          label="Quantidade"
          tipo="numero"
          descricao={`Saldo atual: ${pacote.saldo} sessão(ões)`}
        />
        <FormField
          name="observacoes"
          label="Observações"
          tipo="textarea"
          placeholder="Observações do atendimento (opcional)..."
        />
      </FormLayout>
    </Modal>
  );
}
