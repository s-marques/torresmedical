import {
  transferirConversaWhatsappSchema,
  type TransferirConversaWhatsappInput,
} from '@torres/shared';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/ui/button';
import { useTransferirConversa } from './use-whatsapp';

const FORM_ID = 'form-transferir-conversa';

export interface ModalTransferirProps {
  conversaId: string;
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
}

/** Botão Transferir: passa a conversa em atendimento para outro usuário ativo. */
export function ModalTransferir({
  conversaId,
  aberto,
  onAbertoChange,
}: Readonly<ModalTransferirProps>) {
  const form = useFormulario<{ usuarioId: string | null }, TransferirConversaWhatsappInput>(
    transferirConversaWhatsappSchema,
    { defaultValues: { usuarioId: null } },
  );
  const transferir = useTransferirConversa(conversaId);

  function alterarAberto(novo: boolean) {
    if (!novo) form.reset({ usuarioId: null });
    onAbertoChange(novo);
  }

  return (
    <Modal
      aberto={aberto}
      onAbertoChange={alterarAberto}
      titulo="Transferir conversa"
      descricao="A conversa passa para o atendente escolhido."
      tamanho="sm"
      rodape={
        <>
          <Button type="button" variant="outline" onClick={() => alterarAberto(false)}>
            Cancelar
          </Button>
          <Button type="submit" form={FORM_ID} disabled={form.formState.isSubmitting}>
            Transferir
          </Button>
        </>
      }
    >
      <FormLayout
        id={FORM_ID}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await transferir.mutateAsync(valores);
          alterarAberto(false);
        }}
      >
        <FormField
          name="usuarioId"
          label="Transferir para"
          tipo="entidade"
          entidade="usuarios"
          placeholder="Selecione o atendente"
          obrigatorio
        />
      </FormLayout>
    </Modal>
  );
}
