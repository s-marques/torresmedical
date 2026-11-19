import {
  createDocumentoConhecimentoSchema,
  DOCUMENTO_CONHECIMENTO_CATEGORIA_PADRAO,
  DOCUMENTO_CONHECIMENTO_CATEGORIAS,
  type DocumentoConhecimento,
  type DocumentoConhecimentoFormulario,
} from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useAlterarDocumento, useCriarDocumento } from './use-base-conhecimento';

const ID_FORMULARIO = 'form-documento-conhecimento';

const OPCOES_CATEGORIA = DOCUMENTO_CONHECIMENTO_CATEGORIAS.map((categoria) => ({
  valor: categoria,
  rotulo: categoria,
}));

function valoresIniciais(documento?: DocumentoConhecimento): DocumentoConhecimentoFormulario {
  return {
    titulo: documento?.titulo ?? '',
    profissionalId: documento?.profissionalId ?? null,
    categoria: (documento?.categoria ??
      DOCUMENTO_CONHECIMENTO_CATEGORIA_PADRAO) as DocumentoConhecimentoFormulario['categoria'],
    conteudo: documento?.conteudo ?? '',
  };
}

export interface ModalDocumentoConhecimentoProps {
  /** Sem documento: "Novo Documento". Com documento: "Editar Documento". */
  documento?: DocumentoConhecimento;
  onFechar: () => void;
}

/**
 * Modal do inventário (estados "Novo Documento" e "Editar"): Título *, Profissional, Categoria e
 * Conteúdo *. O único botão de gravar é "Salvar e Indexar".
 */
export function ModalDocumentoConhecimento({
  documento,
  onFechar,
}: Readonly<ModalDocumentoConhecimentoProps>) {
  const criar = useCriarDocumento();
  const alterar = useAlterarDocumento(documento?.id ?? '');
  const form = useFormulario(createDocumentoConhecimentoSchema, {
    defaultValues: valoresIniciais(documento),
  });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={documento ? 'Editar Documento' : 'Novo Documento'}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar="Salvar e Indexar"
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
          await (documento ? alterar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField name="titulo" label="Título" obrigatorio className="sm:col-span-2" />
        <FormField
          name="profissionalId"
          label="Profissional"
          tipo="entidade"
          entidade="profissionais"
          placeholder="Geral (todos)"
        />
        <FormField name="categoria" label="Categoria" tipo="select" opcoes={OPCOES_CATEGORIA} />
        <FormField
          name="conteudo"
          label="Conteúdo"
          tipo="textarea"
          obrigatorio
          className="sm:col-span-2"
        />
      </FormLayout>
    </Modal>
  );
}
