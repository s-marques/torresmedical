import {
  ATENDIMENTO_DOCUMENTO_TIPOS,
  atendimentoDocumentoInputSchema,
  type AtendimentoDocumentoFormulario,
  type CreateAtendimentoDocumentoInput,
} from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { hojeISO } from '@/lib/datas';
import { useCriarDocumentoAtendimento } from './use-atendimento-registros';

const ID_FORMULARIO = 'form-documento-atendimento';

export interface ModalDocumentoAtendimentoProps {
  pacienteId: string;
  atendimentoId: string;
  onFechar: () => void;
}

/** Botão "Emitir documento" do atendimento (issue #151): atestado, declaração ou solicitação. */
export function ModalDocumentoAtendimento({
  pacienteId,
  atendimentoId,
  onFechar,
}: Readonly<ModalDocumentoAtendimentoProps>) {
  const { t } = useTranslation();
  const criar = useCriarDocumentoAtendimento(pacienteId, atendimentoId);
  const form = useFormulario(atendimentoDocumentoInputSchema, {
    defaultValues: {
      tipo: 'ATESTADO',
      texto: '',
      dataEmissao: hojeISO(),
    } as AtendimentoDocumentoFormulario,
  });
  const campo = (nome: string) => t(`atendimentoRegistros.campos.${nome}`);
  const opcoesTipo = ATENDIMENTO_DOCUMENTO_TIPOS.map((valor) => ({
    valor,
    rotulo: t(`atendimentoRegistros.tiposDocumento.${valor}`),
  }));

  async function salvar(valores: CreateAtendimentoDocumentoInput) {
    await criar.mutateAsync(valores);
    onFechar();
  }

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={t('atendimentoRegistros.documentos.novo')}
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
        <FormField name="dataEmissao" label={campo('dataEmissao')} tipo="data" obrigatorio />
        <FormField
          name="texto"
          label={campo('texto')}
          tipo="textarea"
          obrigatorio
          className="sm:col-span-2"
        />
      </FormLayout>
    </Modal>
  );
}
