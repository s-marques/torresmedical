import {
  ATENDIMENTO_TIPO_ROTULOS,
  ATENDIMENTO_TIPOS,
  atendimentoAtualizacaoSchema,
  type Atendimento,
  type AtendimentoAtualizacaoFormulario,
  type UpdateAtendimentoInput,
} from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useAtualizarAtendimento } from './use-atendimento-registros';

const ID_FORMULARIO = 'form-editar-atendimento';

const OPCOES_TIPO = ATENDIMENTO_TIPOS.map((tipo) => ({
  valor: tipo,
  rotulo: ATENDIMENTO_TIPO_ROTULOS[tipo],
}));

export interface ModalEditarAtendimentoProps {
  atendimento: Atendimento;
  onFechar: () => void;
}

/** Corrige o conteúdo de um atendimento ainda não assinado (issue #151). */
export function ModalEditarAtendimento({
  atendimento,
  onFechar,
}: Readonly<ModalEditarAtendimentoProps>) {
  const { t } = useTranslation();
  const atualizar = useAtualizarAtendimento(atendimento.pacienteId, atendimento.id);
  const form = useFormulario(atendimentoAtualizacaoSchema, {
    defaultValues: {
      tipo: atendimento.tipo,
      queixa: atendimento.queixa ?? '',
      evolucao: atendimento.evolucao ?? '',
      diagnostico: atendimento.diagnostico ?? '',
      conduta: atendimento.conduta ?? '',
      observacoes: atendimento.observacoes ?? '',
    } as AtendimentoAtualizacaoFormulario,
  });
  const campo = (nome: string) => t(`atendimentoRegistros.campos.${nome}`);

  async function salvar(valores: UpdateAtendimentoInput) {
    await atualizar.mutateAsync(valores);
    onFechar();
  }

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={t('atendimentoRegistros.editar')}
      tamanho="lg"
      rodape={<FormAcoes form={form} formId={ID_FORMULARIO} onCancelar={onFechar} />}
    >
      <FormLayout id={ID_FORMULARIO} form={form} acoes={null} colunas={2} onSubmit={salvar}>
        <FormField name="tipo" label={campo('tipo')} tipo="select" opcoes={OPCOES_TIPO} />
        <FormField
          name="queixa"
          label={campo('queixa')}
          tipo="textarea"
          className="col-span-full"
        />
        <FormField
          name="evolucao"
          label={campo('evolucao')}
          tipo="textarea"
          className="col-span-full"
        />
        <FormField name="diagnostico" label={campo('diagnostico')} tipo="textarea" />
        <FormField name="conduta" label={campo('conduta')} tipo="textarea" />
        <FormField
          name="observacoes"
          label={campo('observacoes')}
          tipo="textarea"
          className="col-span-full"
        />
      </FormLayout>
    </Modal>
  );
}
