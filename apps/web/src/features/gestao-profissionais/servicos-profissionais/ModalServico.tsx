import {
  createServicoProfissionalSchema,
  SERVICO_DURACAO_PADRAO,
  type ServicoProfissional,
  type ServicoProfissionalFormulario,
} from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useAlterarServico, useCriarServico } from './use-servicos-profissionais';

const ID_FORMULARIO = 'form-servico-profissional';

function valoresIniciais(servico?: ServicoProfissional): ServicoProfissionalFormulario {
  return {
    profissionalId: servico?.profissionalId ?? '',
    nome: servico?.nome ?? '',
    categoria: servico?.categoria ?? '',
    valor: servico?.valor ?? 0,
    duracaoMinutos: servico?.duracaoMinutos ?? SERVICO_DURACAO_PADRAO,
    descricao: servico?.descricao ?? '',
  };
}

export interface ModalServicoProps {
  /** Sem serviço: "Novo Serviço" (Criar). Com serviço: "Editar Serviço" (Atualizar). */
  servico?: ServicoProfissional;
  /** Profissional já filtrado na tela, pré-selecionado em "Novo Serviço". */
  profissionalId?: string | null;
  onFechar: () => void;
}

export function ModalServico({ servico, profissionalId, onFechar }: Readonly<ModalServicoProps>) {
  const criar = useCriarServico();
  const alterar = useAlterarServico(servico?.id ?? '');
  const form = useFormulario(createServicoProfissionalSchema, {
    defaultValues: {
      ...valoresIniciais(servico),
      ...(servico || !profissionalId ? {} : { profissionalId }),
    },
  });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={servico ? 'Editar Serviço' : 'Novo Serviço'}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={servico ? 'Atualizar' : 'Criar'}
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
          await (servico ? alterar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField
          name="profissionalId"
          label="Profissional"
          tipo="entidade"
          entidade="profissionais"
          obrigatorio
          className="sm:col-span-2"
        />
        <FormField name="nome" label="Nome do Serviço" obrigatorio className="sm:col-span-2" />
        <FormField name="categoria" label="Categoria" placeholder="Ex: Estética" />
        <FormField name="valor" label="Valor (R$)" tipo="moeda" />
        <FormField
          name="duracaoMinutos"
          label="Duração (minutos)"
          tipo="numero"
          className="sm:col-span-2"
        />
        <FormField
          name="descricao"
          label="Descrição"
          tipo="textarea"
          placeholder="Opcional"
          className="sm:col-span-2"
        />
      </FormLayout>
    </Modal>
  );
}
