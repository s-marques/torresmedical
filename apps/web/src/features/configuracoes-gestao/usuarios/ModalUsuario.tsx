import {
  createUsuarioSchema,
  updateUsuarioSchema,
  type Usuario,
  type UsuarioEdicaoFormulario,
  type UsuarioFormulario,
} from '@torres/shared';
import type { OpcaoCampo } from '@/components/shared/form/tipos';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useCriarUsuario, useEditarUsuario } from './use-usuarios';

const ID_FORMULARIO = 'form-usuario';

const OPCOES_STATUS: readonly OpcaoCampo[] = [
  { valor: 'ativo', rotulo: 'Ativo' },
  { valor: 'inativo', rotulo: 'Inativo' },
];

export interface ModalUsuarioProps {
  /** Sem usuário: "Novo Usuario". Com usuário: "Editar Usuario". */
  usuario?: Usuario;
  onFechar: () => void;
}

export function ModalUsuario({ usuario, onFechar }: Readonly<ModalUsuarioProps>) {
  return usuario ? (
    <ModalEditarUsuario usuario={usuario} onFechar={onFechar} />
  ) : (
    <ModalCriarUsuario onFechar={onFechar} />
  );
}

function ModalCriarUsuario({ onFechar }: Readonly<{ onFechar: () => void }>) {
  const criar = useCriarUsuario();
  const form = useFormulario(createUsuarioSchema, {
    defaultValues: {
      nome: '',
      email: '',
      senha: '',
      telefone: '',
      cargo: '',
      perfilId: null,
      verDadosSensiveis: false,
    } satisfies UsuarioFormulario,
  });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Novo Usuario"
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar="Cadastrar"
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        colunas={2}
        onSubmit={async (valores) => {
          await criar.mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField name="nome" label="Nome" obrigatorio placeholder="Nome completo" />
        <FormField
          name="email"
          label="Email"
          tipo="email"
          obrigatorio
          placeholder="email@exemplo.com"
        />
        <FormField
          name="senha"
          label="Senha"
          tipo="senha"
          obrigatorio
          descricao="Mínimo 8 caracteres, com letras e números."
        />
        <FormField name="telefone" label="Telefone" tipo="telefone" />
        <FormField name="cargo" label="Cargo" placeholder="Ex: Recepcionista" />
        <FormField
          name="perfilId"
          label="Perfil de Acesso"
          tipo="entidade"
          entidade="perfis"
          placeholder="Sem perfil (usa padrão da role)"
          descricao="Define quais páginas o usuário pode acessar. Cadastre perfis em Configurações → Perfis de Acesso."
          className="sm:col-span-2"
        />
        <FormField
          name="verDadosSensiveis"
          label="Ver dados sensíveis (LGPD) — CPF, RG, endereço, e-mail dos pacientes"
          tipo="checkbox"
          className="sm:col-span-2"
        />
      </FormLayout>
    </Modal>
  );
}

function ModalEditarUsuario({
  usuario,
  onFechar,
}: Readonly<{ usuario: Usuario; onFechar: () => void }>) {
  const editar = useEditarUsuario(usuario.id);
  const form = useFormulario(updateUsuarioSchema, {
    defaultValues: {
      nome: usuario.nome,
      email: usuario.email,
      telefone: usuario.telefone ?? '',
      cargo: usuario.cargo ?? '',
      perfilId: usuario.perfilId,
      verDadosSensiveis: usuario.verDadosSensiveis,
      status: usuario.ativo ? 'ativo' : 'inativo',
    } satisfies UsuarioEdicaoFormulario,
  });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Editar Usuario"
      rodape={
        <FormAcoes form={form} formId={ID_FORMULARIO} rotuloEnviar="Salvar" onCancelar={onFechar} />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        colunas={2}
        onSubmit={async (valores) => {
          await editar.mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField name="nome" label="Nome" obrigatorio placeholder="Nome completo" />
        <FormField
          name="email"
          label="Email"
          tipo="email"
          obrigatorio
          placeholder="email@exemplo.com"
        />
        <FormField name="telefone" label="Telefone" tipo="telefone" />
        <FormField name="cargo" label="Cargo" placeholder="Ex: Recepcionista" />
        <FormField
          name="perfilId"
          label="Perfil de Acesso"
          tipo="entidade"
          entidade="perfis"
          placeholder="Sem perfil (usa padrão da role)"
          descricao="Define quais páginas o usuário pode acessar. Cadastre perfis em Configurações → Perfis de Acesso."
          className="sm:col-span-2"
        />
        <FormField name="status" label="Status" tipo="select" opcoes={OPCOES_STATUS} />
        <FormField
          name="verDadosSensiveis"
          label="Ver dados sensíveis (LGPD) — CPF, RG, endereço, e-mail dos pacientes"
          tipo="checkbox"
          className="sm:col-span-2"
        />
      </FormLayout>
    </Modal>
  );
}
