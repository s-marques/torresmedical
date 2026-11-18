import {
  createCanalWhatsappSchema,
  updateCanalWhatsappSchema,
  type CanalWhatsapp,
  type CanalWhatsappEdicaoFormulario,
  formatarTelefoneWhatsapp,
} from '@torres/shared';
import { Controller } from 'react-hook-form';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { SeletorUsuarios } from './SeletorUsuarios';
import { useAlterarCanal, useCriarCanal } from './use-canais-whatsapp';

const ID_FORMULARIO = 'form-canal-whatsapp';
const DESCRICAO_PROFISSIONAL = 'Vazio = linha da clínica.';

interface ModalProps {
  onFechar: () => void;
}

/** Modal "Novo Canal WhatsApp" (aba DinastiAPI): Nome do Canal *, Número WhatsApp * e usuários com acesso. */
export function ModalNovoCanal({ onFechar }: Readonly<ModalProps>) {
  const criar = useCriarCanal();
  const form = useFormulario(createCanalWhatsappSchema, {
    defaultValues: { nome: '', numero: '', profissionalId: null, usuarioIds: [] },
  });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Novo Canal WhatsApp"
      rodape={
        <FormAcoes form={form} formId={ID_FORMULARIO} rotuloEnviar="Criar" onCancelar={onFechar} />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await criar.mutateAsync(valores);
          onFechar();
        }}
      >
        <div
          role="tablist"
          aria-label="Provedor"
          className="grid rounded-lg bg-muted p-1 text-sm font-medium"
        >
          <span
            role="tab"
            aria-selected
            className="rounded-md bg-background px-3 py-1.5 text-center shadow-xs"
          >
            DinastiAPI
          </span>
        </div>
        <FormField
          name="nome"
          label="Nome do Canal"
          obrigatorio
          placeholder="Ex: Recepcao Principal"
        />
        <FormField
          name="numero"
          label="Numero WhatsApp"
          obrigatorio
          placeholder="+55 (11) 99999-9999"
        />
        <FormField
          name="profissionalId"
          label="Profissional"
          tipo="entidade"
          entidade="profissionais"
          descricao={DESCRICAO_PROFISSIONAL}
        />
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Usuarios com acesso</legend>
          <p className="text-sm text-muted-foreground">
            Selecione quais usuarios poderao ver este canal. Se nenhum for selecionado, todos terao
            acesso.
          </p>
          <Controller
            control={form.control}
            name="usuarioIds"
            render={({ field }) => (
              <SeletorUsuarios value={field.value ?? []} onChange={field.onChange} />
            )}
          />
        </fieldset>
      </FormLayout>
    </Modal>
  );
}

function valoresEdicao(canal: CanalWhatsapp): CanalWhatsappEdicaoFormulario {
  return {
    nome: canal.nome,
    numero: formatarTelefoneWhatsapp(canal.numero),
    profissionalId: canal.profissionalId,
  };
}

/** Modal "Editar Canal DinastiAPI": Nome do Canal e Telefone (mais o vínculo com o profissional). */
export function ModalEditarCanal({
  canal,
  onFechar,
}: Readonly<ModalProps & { canal: CanalWhatsapp }>) {
  const alterar = useAlterarCanal(canal.id);
  const form = useFormulario(updateCanalWhatsappSchema, {
    defaultValues: valoresEdicao(canal),
  });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Editar Canal DinastiAPI"
      rodape={
        <FormAcoes form={form} formId={ID_FORMULARIO} rotuloEnviar="Salvar" onCancelar={onFechar} />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await alterar.mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField name="nome" label="Nome do Canal" />
        <FormField name="numero" label="Telefone" />
        <FormField
          name="profissionalId"
          label="Profissional"
          tipo="entidade"
          entidade="profissionais"
          descricao={DESCRICAO_PROFISSIONAL}
        />
      </FormLayout>
    </Modal>
  );
}
