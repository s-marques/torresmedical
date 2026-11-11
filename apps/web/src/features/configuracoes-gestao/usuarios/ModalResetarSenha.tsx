import { resetarSenhaUsuarioSchema, type Usuario } from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useResetarSenhaUsuario } from './use-usuarios';

const ID_FORMULARIO = 'form-resetar-senha';

export interface ModalResetarSenhaProps {
  usuario: Usuario;
  onFechar: () => void;
}

/** Ação "Resetar Senha" do menu da linha: o admin digita a senha nova do usuário. */
export function ModalResetarSenha({ usuario, onFechar }: Readonly<ModalResetarSenhaProps>) {
  const resetar = useResetarSenhaUsuario(usuario.id);
  const form = useFormulario(resetarSenhaUsuarioSchema, { defaultValues: { senha: '' } });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Resetar Senha"
      descricao={
        <>
          Resetar senha de <span className="font-medium text-foreground">{usuario.nome}</span>
        </>
      }
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar="Resetar Senha"
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await resetar.mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField name="senha" label="Nova Senha" tipo="senha" obrigatorio />
      </FormLayout>
    </Modal>
  );
}
