import {
  PROFISSIONAL_DOCUMENTO_TIPOS,
  profissionalDocumentoInputSchema,
  type ProfissionalDocumento,
  type ProfissionalDocumentoInput,
} from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { FileUpload } from '@/components/shared/FileUpload';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useAtualizarDocumento, useCriarDocumento } from './use-documentos-profissional';

const ID_FORMULARIO = 'form-documento-profissional';

export interface ModalDocumentoProfissionalProps {
  profissionalId: string;
  /** Sem documento: "Novo documento". Com documento: "Editar documento". */
  documento?: ProfissionalDocumento;
  onFechar: () => void;
}

/**
 * Modal "Novo documento" / "Editar documento" (issue #141): tipo, arquivo, número, emissão,
 * validade e observação. Salvar devolve o documento para "Enviado" (nova validação).
 */
export function ModalDocumentoProfissional({
  profissionalId,
  documento,
  onFechar,
}: Readonly<ModalDocumentoProfissionalProps>) {
  const { t } = useTranslation();
  const criar = useCriarDocumento(profissionalId);
  const atualizar = useAtualizarDocumento(profissionalId, documento?.id ?? '');
  const form = useFormulario(profissionalDocumentoInputSchema, {
    defaultValues: {
      tipo: documento?.tipo ?? '',
      arquivoId: documento?.arquivoId ?? '',
      numero: documento?.numero ?? '',
      emissao: documento?.emissao ?? '',
      validade: documento?.validade ?? '',
      observacao: documento?.observacao ?? '',
    },
  });
  const campo = (nome: string) => t(`profissionalDocumentos.campos.${nome}`);
  const erroArquivo = form.formState.errors.arquivoId?.message;
  const arquivoAtual = form.watch('arquivoId');

  const opcoesTipo = PROFISSIONAL_DOCUMENTO_TIPOS.map((valor) => ({
    valor,
    rotulo: t(`profissionalDocumentos.tipos.${valor}`),
  }));

  async function salvar(valores: ProfissionalDocumentoInput) {
    if (documento) await atualizar.mutateAsync(valores);
    else await criar.mutateAsync(valores);
    onFechar();
  }

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={documento ? t('profissionalDocumentos.editar') : t('profissionalDocumentos.novo')}
      descricao={documento ? t('profissionalDocumentos.avisoRevalidar') : undefined}
      tamanho="lg"
      rodape={<FormAcoes form={form} formId={ID_FORMULARIO} onCancelar={onFechar} />}
    >
      <FormLayout id={ID_FORMULARIO} form={form} acoes={null} colunas={2} onSubmit={salvar}>
        <FormField
          name="tipo"
          label={campo('tipo')}
          tipo="select"
          opcoes={opcoesTipo}
          placeholder={t('profissionalDocumentos.placeholderTipo')}
          obrigatorio
          className="sm:col-span-2"
        />
        <div className="grid gap-2 sm:col-span-2">
          <FileUpload
            uso="documento-profissional"
            label={campo('arquivo')}
            onUploaded={(arquivo) =>
              form.setValue('arquivoId', arquivo.id, { shouldDirty: true, shouldValidate: true })
            }
          />
          {documento?.arquivoNome && arquivoAtual === documento.arquivoId && (
            <p className="text-sm text-muted-foreground">
              {t('profissionalDocumentos.arquivoAtual', { nome: documento.arquivoNome })}
            </p>
          )}
          {erroArquivo && (
            <p role="alert" className="text-sm text-destructive">
              {erroArquivo}
            </p>
          )}
        </div>
        <FormField name="numero" label={campo('numero')} className="sm:col-span-2" />
        <FormField name="emissao" label={campo('emissao')} tipo="data" />
        <FormField name="validade" label={campo('validade')} tipo="data" />
        <FormField
          name="observacao"
          label={campo('observacao')}
          tipo="textarea"
          className="sm:col-span-2"
        />
      </FormLayout>
    </Modal>
  );
}
