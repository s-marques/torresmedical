import {
  createPerfilSchema,
  ESCOPO_DADOS_LABELS,
  ESCOPOS_DADOS,
  type Perfil,
  type PerfilFormulario,
} from '@torres/shared';
import type { OpcaoCampo } from '@/components/shared/form/tipos';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { SeletorPaginas } from './SeletorPaginas';
import { useCriarPerfil, useEditarPerfil } from './use-perfis-acesso';

const ID_FORMULARIO = 'form-perfil';

export interface ModalPerfilProps {
  /** Sem perfil: "Novo Perfil". Com perfil: "Editar Perfil". */
  perfil?: Perfil;
  onFechar: () => void;
}

function valoresIniciais(perfil?: Perfil): PerfilFormulario {
  return {
    nome: perfil?.nome ?? '',
    descricao: perfil?.descricao ?? '',
    paginasPermitidas: perfil?.paginasPermitidas ?? [],
    escopoDados: perfil?.escopoDados ?? 'TODOS',
  };
}

/** Issue #153: de quem são os dados (agenda, pacientes, prontuário, salas) que o perfil vê. */
const OPCOES_ESCOPO: readonly OpcaoCampo[] = ESCOPOS_DADOS.map((valor) => ({
  valor,
  rotulo: ESCOPO_DADOS_LABELS[valor],
}));

const DESCRICAO_ESCOPO =
  'Restrito: a agenda, os pacientes, o prontuário e as salas mostram só os profissionais vinculados a cada usuário (campo "Profissionais vinculados" da tela Usuários).';

/** Modal "Novo Perfil" e "Editar Perfil": Nome, Descrição, Dados visíveis e Páginas Permitidas. */
export function ModalPerfil({ perfil, onFechar }: Readonly<ModalPerfilProps>) {
  const criar = useCriarPerfil();
  const editar = useEditarPerfil(perfil?.id ?? '');
  const form = useFormulario(createPerfilSchema, { defaultValues: valoresIniciais(perfil) });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={perfil ? 'Editar Perfil' : 'Novo Perfil'}
      tamanho="lg"
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={perfil ? 'Salvar' : 'Cadastrar'}
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        colunas={2}
        acoes={null}
        onSubmit={async (valores) => {
          await (perfil ? editar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField name="nome" label="Nome" obrigatorio placeholder="Ex: Recepção" />
        <FormField
          name="descricao"
          label="Descrição"
          placeholder="Ex: Acesso para recepcionistas"
        />
        <FormField
          name="escopoDados"
          label="Dados visíveis"
          tipo="select"
          opcoes={OPCOES_ESCOPO}
          descricao={DESCRICAO_ESCOPO}
          className="sm:col-span-2"
        />
        <SeletorPaginas className="sm:col-span-2" />
      </FormLayout>
    </Modal>
  );
}
