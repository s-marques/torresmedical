import {
  createRespostaRapidaSchema,
  RESPOSTA_RAPIDA_CATEGORIA_PADRAO,
  type RespostaRapida,
  type RespostaRapidaFormulario,
} from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useAlterarResposta, useCriarResposta } from './use-respostas-rapidas';

const ID_FORMULARIO = 'form-resposta-rapida';

function valoresIniciais(resposta?: RespostaRapida): RespostaRapidaFormulario {
  return {
    titulo: resposta?.titulo ?? '',
    mensagem: resposta?.mensagem ?? '',
    categoria: resposta?.categoria ?? RESPOSTA_RAPIDA_CATEGORIA_PADRAO,
    atalho: resposta?.atalho ?? '',
  };
}

export interface ModalRespostaRapidaProps {
  /** Sem resposta: "Nova Resposta Rápida" (Criar). Com resposta: "Editar Resposta Rápida" (Salvar). */
  resposta?: RespostaRapida;
  onFechar: () => void;
}

/** Modal do inventário (estado "Nova Resposta"): Título *, Mensagem *, Categoria e Atalho. */
export function ModalRespostaRapida({ resposta, onFechar }: Readonly<ModalRespostaRapidaProps>) {
  const criar = useCriarResposta();
  const alterar = useAlterarResposta(resposta?.id ?? '');
  const form = useFormulario(createRespostaRapidaSchema, {
    defaultValues: valoresIniciais(resposta),
  });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={resposta ? 'Editar Resposta Rápida' : 'Nova Resposta Rápida'}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={resposta ? 'Salvar' : 'Criar'}
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
          await (resposta ? alterar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField
          name="titulo"
          label="Título"
          obrigatorio
          placeholder="Ex: Boas-vindas"
          className="sm:col-span-2"
        />
        <FormField
          name="mensagem"
          label="Mensagem"
          tipo="textarea"
          obrigatorio
          placeholder="Digite o texto da mensagem padrão..."
          className="sm:col-span-2"
        />
        <FormField name="categoria" label="Categoria" />
        <FormField name="atalho" label="Atalho" placeholder="/boasvindas" />
      </FormLayout>
    </Modal>
  );
}
