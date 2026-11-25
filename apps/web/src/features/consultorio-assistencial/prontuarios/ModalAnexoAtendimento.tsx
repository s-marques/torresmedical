import {
  ATENDIMENTO_ANEXO_TIPOS,
  atendimentoAnexoInputSchema,
  type AtendimentoAnexoFormulario,
  type CreateAtendimentoAnexoInput,
} from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { FileUpload } from '@/components/shared/FileUpload';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { hojeISO } from '@/lib/datas';
import { useCriarAnexo } from './use-atendimento-registros';

const ID_FORMULARIO = 'form-anexo-atendimento';

export interface ModalAnexoAtendimentoProps {
  pacienteId: string;
  atendimentoId: string;
  onFechar: () => void;
}

/** Botão "Novo exame ou anexo" do atendimento (issue #151): tipo, arquivo, data e descrição. */
export function ModalAnexoAtendimento({
  pacienteId,
  atendimentoId,
  onFechar,
}: Readonly<ModalAnexoAtendimentoProps>) {
  const { t } = useTranslation();
  const criar = useCriarAnexo(pacienteId, atendimentoId);
  const form = useFormulario(atendimentoAnexoInputSchema, {
    defaultValues: {
      tipo: 'EXAME',
      arquivoId: '',
      data: hojeISO(),
      descricao: '',
    } as AtendimentoAnexoFormulario,
  });
  const campo = (nome: string) => t(`atendimentoRegistros.campos.${nome}`);
  const erroArquivo = form.formState.errors.arquivoId?.message;
  const opcoesTipo = ATENDIMENTO_ANEXO_TIPOS.map((valor) => ({
    valor,
    rotulo: t(`atendimentoRegistros.tiposAnexo.${valor}`),
  }));

  async function salvar(valores: CreateAtendimentoAnexoInput) {
    await criar.mutateAsync(valores);
    onFechar();
  }

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={t('atendimentoRegistros.anexos.novo')}
      tamanho="lg"
      rodape={<FormAcoes form={form} formId={ID_FORMULARIO} onCancelar={onFechar} />}
    >
      <FormLayout id={ID_FORMULARIO} form={form} acoes={null} colunas={2} onSubmit={salvar}>
        <FormField
          name="tipo"
          label={campo('tipo')}
          tipo="select"
          opcoes={opcoesTipo}
          obrigatorio
        />
        <FormField name="data" label={campo('data')} tipo="data" obrigatorio />
        <div className="grid gap-2 sm:col-span-2">
          <FileUpload
            uso="anexo-atendimento"
            label={campo('arquivo')}
            onUploaded={(arquivo) =>
              form.setValue('arquivoId', arquivo.id, { shouldDirty: true, shouldValidate: true })
            }
          />
          {erroArquivo && (
            <p role="alert" className="text-sm text-destructive">
              {erroArquivo}
            </p>
          )}
        </div>
        <FormField
          name="descricao"
          label={campo('descricao')}
          tipo="textarea"
          className="sm:col-span-2"
        />
      </FormLayout>
    </Modal>
  );
}
