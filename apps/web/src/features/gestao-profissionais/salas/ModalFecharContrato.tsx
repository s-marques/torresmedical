import {
  cancelarContratoSalaSchema,
  encerrarContratoSalaSchema,
  type CancelarContratoSalaFormulario,
  type ContratoSala,
  type EncerrarContratoSalaFormulario,
} from '@torres/shared';
import { BanIcon, Loader2Icon, XCircleIcon } from 'lucide-react';
import { useFormState } from 'react-hook-form';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/ui/button';
import { hojeISO } from '@/lib/datas';
import { cn } from '@/lib/utils';
import { useCancelarContrato, useEncerrarContrato } from './use-contratos-sala';

const ID_FORMULARIO = 'form-fechar-contrato';

const AVISO = 'Parcelas pendentes após a data de {acao} serão canceladas automaticamente.';

export interface ModalFecharContratoProps {
  contrato: ContratoSala;
  /** Encerrar: término natural. Cancelar: rescisão. */
  tipo: 'encerrar' | 'cancelar';
  onFechar: () => void;
}

/** "Encerrar Contrato" (término natural) e "Cancelar Contrato (Rescisão)": data e texto livre. */
export function ModalFecharContrato({
  contrato,
  tipo,
  onFechar,
}: Readonly<ModalFecharContratoProps>) {
  return tipo === 'encerrar' ? (
    <ModalEncerrar contrato={contrato} onFechar={onFechar} />
  ) : (
    <ModalCancelar contrato={contrato} onFechar={onFechar} />
  );
}

function ModalEncerrar({ contrato, onFechar }: Readonly<Omit<ModalFecharContratoProps, 'tipo'>>) {
  const encerrar = useEncerrarContrato(contrato.id);
  const form = useFormulario<
    EncerrarContratoSalaFormulario,
    ReturnType<typeof encerrarContratoSalaSchema.parse>
  >(encerrarContratoSalaSchema, { defaultValues: { data: hojeISO(), observacao: '' } });
  return (
    <Corpo
      contrato={contrato}
      titulo="Encerrar Contrato"
      rotuloVoltar="Cancelar"
      rotuloConfirmar="Encerrar"
      icone={BanIcon}
      aviso={AVISO.replace('{acao}', 'encerramento')}
      onFechar={onFechar}
      form={form}
      onSubmit={async (valores) => {
        await encerrar.mutateAsync(valores);
        onFechar();
      }}
    >
      <FormField name="data" label="Data de Encerramento" tipo="data" obrigatorio />
      <FormField
        name="observacao"
        label="Observação (opcional)"
        tipo="textarea"
        placeholder="Motivo do encerramento..."
      />
    </Corpo>
  );
}

function ModalCancelar({ contrato, onFechar }: Readonly<Omit<ModalFecharContratoProps, 'tipo'>>) {
  const cancelar = useCancelarContrato(contrato.id);
  const form = useFormulario<
    CancelarContratoSalaFormulario,
    ReturnType<typeof cancelarContratoSalaSchema.parse>
  >(cancelarContratoSalaSchema, { defaultValues: { data: hojeISO(), motivo: '' } });
  return (
    <Corpo
      contrato={contrato}
      titulo="Cancelar Contrato (Rescisão)"
      tituloDestrutivo
      rotuloVoltar="Voltar"
      rotuloConfirmar="Cancelar Contrato"
      icone={XCircleIcon}
      aviso={AVISO.replace('{acao}', 'cancelamento')}
      avisoDestrutivo
      onFechar={onFechar}
      form={form}
      onSubmit={async (valores) => {
        await cancelar.mutateAsync(valores);
        onFechar();
      }}
    >
      <FormField name="data" label="Data de Cancelamento" tipo="data" obrigatorio />
      <FormField
        name="motivo"
        label="Motivo da Rescisão"
        tipo="textarea"
        placeholder="Motivo do cancelamento/rescisão..."
      />
    </Corpo>
  );
}

interface CorpoProps<TIn extends Record<string, unknown>, TOut extends Record<string, unknown>> {
  contrato: ContratoSala;
  titulo: string;
  tituloDestrutivo?: boolean;
  rotuloVoltar: string;
  rotuloConfirmar: string;
  icone: typeof BanIcon;
  aviso: string;
  avisoDestrutivo?: boolean;
  onFechar: () => void;
  form: ReturnType<typeof useFormulario<TIn, TOut>>;
  onSubmit: (valores: TOut) => Promise<void>;
  children: React.ReactNode;
}

function Corpo<TIn extends Record<string, unknown>, TOut extends Record<string, unknown>>({
  contrato,
  titulo,
  tituloDestrutivo,
  rotuloVoltar,
  rotuloConfirmar,
  icone: Icone,
  aviso,
  avisoDestrutivo,
  onFechar,
  form,
  onSubmit,
  children,
}: Readonly<CorpoProps<TIn, TOut>>) {
  const { isSubmitting } = useFormState({ control: form.control });
  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={titulo}
      tamanho="md"
      className={cn(tituloDestrutivo && '[&_h2]:text-destructive')}
      rodape={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onFechar}>
            {rotuloVoltar}
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
              <Icone aria-hidden />
            )}
            {rotuloConfirmar}
          </Button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Contrato: <strong>{contrato.salaNome}</strong> - {contrato.locatarioNome}
      </p>
      <FormLayout id={ID_FORMULARIO} form={form} acoes={null} onSubmit={onSubmit}>
        {children}
        <p
          className={cn('text-xs', avisoDestrutivo ? 'text-destructive' : 'text-muted-foreground')}
        >
          {aviso}
        </p>
      </FormLayout>
    </Modal>
  );
}
