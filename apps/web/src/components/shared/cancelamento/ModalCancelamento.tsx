import { mensagemObrigatoria, type TipoCancelamento } from '@torres/shared';
import { Loader2Icon, XCircleIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  useFormState,
  useWatch,
  type FieldValues,
  type Path,
  type UseFormReturn,
} from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMotivosCancelamento } from './use-motivos-cancelamento';

/** Campos que todo cancelamento com motivo tem (`cancelarComMotivoSchema`). */
export interface CamposCancelamento extends FieldValues {
  motivoId: string;
  observacao?: string | null;
}

export interface OpcaoReagendamento {
  valor: string;
  rotulo: string;
}

export interface ModalCancelamentoProps<TIn extends CamposCancelamento, TOut extends FieldValues> {
  /** Lista de motivos usada: consulta, contrato, cobrança, período ou proposta. */
  tipo: TipoCancelamento;
  titulo: string;
  /** Contexto do que será cancelado (nome, período…). */
  descricao?: ReactNode;
  rotuloConfirmar: string;
  /** Criado com `useFormulario(<schema com motivoId e observacao>, …)`. */
  form: UseFormReturn<TIn, unknown, TOut>;
  /** Cancela de fato; se rejeitar, o erro do servidor aparece no formulário. */
  onConfirmar: (valores: TOut) => Promise<unknown>;
  onFechar: () => void;
  /**
   * Consulta: "Reagendou?" com os agendamentos para ligar ao cancelado (campo `reagendouParaId` do
   * formulário). Sem a prop, o campo não aparece.
   */
  opcoesReagendamento?: readonly OpcaoReagendamento[];
  /** Campos próprios do tipo (ex.: a data do contrato), antes do motivo. */
  children?: ReactNode;
  /** Aviso final, ex.: o que acontece em cascata. */
  aviso?: ReactNode;
}

const ID_FORMULARIO = 'form-cancelamento';

/** Motivo da lista, observação e, na consulta, "Reagendou?". Dentro de um `FormLayout`. */
function CamposMotivo<TIn extends CamposCancelamento>({
  form,
  tipo,
  opcoesReagendamento,
}: Readonly<{
  form: UseFormReturn<TIn, unknown, FieldValues>;
  tipo: TipoCancelamento;
  opcoesReagendamento?: readonly OpcaoReagendamento[];
}>) {
  const { t } = useTranslation();
  const motivos = useMotivosCancelamento(tipo);
  const motivoId = useWatch({ control: form.control, name: 'motivoId' as Path<TIn> }) as string;
  const exigeTexto = motivos.data?.find((m) => m.id === motivoId)?.exigeTexto ?? false;

  return (
    <>
      <FormField
        name="motivoId"
        label={t('cancelamento.motivo')}
        tipo="select"
        obrigatorio
        placeholder={motivos.isPending ? t('comum.carregando') : t('cancelamento.selecioneMotivo')}
        opcoes={(motivos.data ?? []).map((m) => ({ valor: m.id, rotulo: m.nome }))}
      />
      <FormField
        name="observacao"
        label={t('cancelamento.observacao')}
        tipo="textarea"
        obrigatorio={exigeTexto}
        placeholder={t('cancelamento.observacaoPlaceholder')}
      />
      {opcoesReagendamento && (
        <FormField
          name="reagendouParaId"
          label={t('cancelamento.reagendou')}
          tipo="select"
          placeholder={t('cancelamento.naoReagendou')}
          descricao={t('cancelamento.reagendouAjuda')}
          opcoes={opcoesReagendamento}
        />
      )}
    </>
  );
}

/**
 * Modal padrão de cancelamento (issue #162, R §34 e §35): o motivo da lista do tipo é obrigatório,
 * a observação é opcional (obrigatória em "Outro") e, na consulta, "Reagendou?" liga ao novo
 * agendamento. Nada é apagado: o cancelamento guarda quem, quando, o motivo e o histórico.
 */
export function ModalCancelamento<TIn extends CamposCancelamento, TOut extends FieldValues>({
  tipo,
  titulo,
  descricao,
  rotuloConfirmar,
  form,
  onConfirmar,
  onFechar,
  opcoesReagendamento,
  children,
  aviso,
}: Readonly<ModalCancelamentoProps<TIn, TOut>>) {
  const { t } = useTranslation();
  const motivos = useMotivosCancelamento(tipo);
  const { isSubmitting } = useFormState({ control: form.control });

  async function confirmar(valores: TOut) {
    const motivoId = (valores as { motivoId?: string }).motivoId;
    const observacao = (valores as { observacao?: string | null }).observacao;
    const motivo = motivos.data?.find((m) => m.id === motivoId);
    if (motivo?.exigeTexto && !observacao?.trim()) {
      form.setError('observacao' as Path<TIn>, {
        message: mensagemObrigatoria(t('cancelamento.observacao'), 'f'),
      });
      return;
    }
    await onConfirmar(valores);
    onFechar();
  }

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={titulo}
      tamanho="md"
      className="[&_h2]:text-destructive"
      rodape={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onFechar}>
            {t('cancelamento.voltar')}
          </Button>
          <Button
            type="submit"
            form={ID_FORMULARIO}
            variant="destructive"
            aria-disabled={isSubmitting}
            className={cn(isSubmitting && 'opacity-50')}
            onClick={(evento) => isSubmitting && evento.preventDefault()}
          >
            {isSubmitting ? (
              <Loader2Icon aria-hidden className="animate-spin" />
            ) : (
              <XCircleIcon aria-hidden />
            )}
            {rotuloConfirmar}
          </Button>
        </div>
      }
    >
      {descricao && <p className="mb-4 text-sm text-muted-foreground">{descricao}</p>}
      <FormLayout
        id={ID_FORMULARIO}
        form={form as UseFormReturn<TIn, unknown, TOut>}
        acoes={null}
        onSubmit={confirmar}
      >
        {children}
        <CamposMotivo
          form={form as unknown as UseFormReturn<TIn, unknown, FieldValues>}
          tipo={tipo}
          opcoesReagendamento={opcoesReagendamento}
        />
        {aviso && <p className="text-xs text-destructive">{aviso}</p>}
      </FormLayout>
    </Modal>
  );
}
