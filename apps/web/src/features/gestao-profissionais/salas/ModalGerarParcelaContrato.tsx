import {
  formatarCompetencia,
  gerarParcelaContratoSchema,
  type ContratoSala,
  type GerarParcelaContratoFormulario,
} from '@torres/shared';
import { CheckIcon, DollarSignIcon, Loader2Icon } from 'lucide-react';
import { useFormState } from 'react-hook-form';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/ui/button';
import { hojeISO } from '@/lib/datas';
import { useConfirmarSemCobranca, useGerarParcelaContrato } from './use-contratos-sala';

const ID_FORMULARIO = 'form-gerar-parcela-contrato';

export interface ModalGerarParcelaContratoProps {
  contrato: ContratoSala;
  onFechar: () => void;
}

/**
 * Linha "Contrato sem cobrança" (issue #115): Por Turno não tem regra automática de valor. O
 * dev informa o valor e o vencimento, ou confirma que não haverá cobrança nesse mês.
 */
export function ModalGerarParcelaContrato({
  contrato,
  onFechar,
}: Readonly<ModalGerarParcelaContratoProps>) {
  const competencia = hojeISO().slice(0, 7);
  const gerar = useGerarParcelaContrato(contrato.id);
  const confirmarSemCobranca = useConfirmarSemCobranca(contrato.id);
  const form = useFormulario<
    GerarParcelaContratoFormulario,
    ReturnType<typeof gerarParcelaContratoSchema.parse>
  >(gerarParcelaContratoSchema, {
    defaultValues: { competencia, valor: undefined, dataVencimento: hojeISO() },
  });
  const { isSubmitting } = useFormState({ control: form.control });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Contrato sem cobrança"
      tamanho="md"
      rodape={
        <div className="flex w-full flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={confirmarSemCobranca.isPending}
            onClick={async () => {
              await confirmarSemCobranca.mutateAsync({ competencia });
              onFechar();
            }}
          >
            <CheckIcon aria-hidden />
            Confirmar sem cobrança
          </Button>
          <Button
            type="submit"
            form={ID_FORMULARIO}
            aria-disabled={isSubmitting}
            className={isSubmitting ? 'opacity-50' : undefined}
            onClick={(evento) => isSubmitting && evento.preventDefault()}
          >
            {isSubmitting ? (
              <Loader2Icon aria-hidden className="animate-spin" />
            ) : (
              <DollarSignIcon aria-hidden />
            )}
            Gerar Parcela
          </Button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Contrato de <strong>{contrato.locatarioNome}</strong> ({contrato.salaNome}): não há regra
        automática para calcular o valor de {formatarCompetencia(competencia)}. Informe o valor e o
        vencimento, ou confirme que não haverá cobrança nesse mês.
      </p>
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await gerar.mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField name="valor" label="Valor (R$)" tipo="moeda" obrigatorio />
        <FormField name="dataVencimento" label="Data de Vencimento" tipo="data" obrigatorio />
      </FormLayout>
    </Modal>
  );
}
