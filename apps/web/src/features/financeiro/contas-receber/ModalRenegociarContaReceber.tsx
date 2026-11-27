import { renegociarContaReceberSchema, type ContaReceber } from '@torres/shared';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useFieldArray, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/ui/button';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { diferencaEmCentavos } from './regras-conta-receber';
import { useRenegociarContaReceber } from './use-contas-receber';

const ID_FORMULARIO = 'form-renegociar-conta-receber';

export interface ModalRenegociarContaReceberProps {
  conta: ContaReceber;
  onFechar: () => void;
}

/**
 * Modal "Renegociar": o saldo em aberto vira uma ou mais parcelas novas (a soma precisa fechar com
 * o saldo). O título original passa a Renegociado e continua ligado aos novos.
 */
export function ModalRenegociarContaReceber({
  conta,
  onFechar,
}: Readonly<ModalRenegociarContaReceberProps>) {
  const { t } = useTranslation();
  const renegociar = useRenegociarContaReceber(conta.id);
  const saldo = Number(conta.saldo);
  const form = useFormulario(renegociarContaReceberSchema, {
    defaultValues: {
      parcelas: [{ valor: saldo, dataVencimento: '' }],
      observacoes: '',
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'parcelas' });
  const parcelas = useWatch({ control: form.control, name: 'parcelas' }) ?? [];
  const diferenca = diferencaEmCentavos(
    saldo,
    parcelas.map((p) => p?.valor),
  );

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={t('contasReceber.renegociar.titulo')}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={t('contasReceber.renegociar.confirmar')}
          onCancelar={onFechar}
        />
      }
    >
      <p className="mb-4 text-sm text-muted-foreground">
        {t('contasReceber.renegociar.descricao', { descricao: conta.descricao })}{' '}
        <strong className="text-foreground">
          {t('contasReceber.baixa.saldoEmAberto', { saldo: formatarMoeda(saldo) })}
        </strong>
      </p>
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        colunas={2}
        onSubmit={async (valores) => {
          await renegociar.mutateAsync(valores);
          onFechar();
        }}
      >
        <div className="grid gap-3 sm:col-span-2">
          {fields.map((campo, indice) => (
            <fieldset key={campo.id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
              <legend className="px-1 text-sm font-medium">
                {t('contasReceber.renegociar.parcela', { numero: indice + 1 })}
              </legend>
              <FormField
                name={`parcelas.${indice}.valor`}
                label={t('contasReceber.renegociar.valor')}
                tipo="moeda"
                obrigatorio
              />
              <FormField
                name={`parcelas.${indice}.dataVencimento`}
                label={t('contasReceber.renegociar.vencimento')}
                tipo="data"
                obrigatorio
              />
              {fields.length > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-self-start sm:col-span-2"
                  onClick={() => remove(indice)}
                >
                  <Trash2Icon aria-hidden />
                  {t('contasReceber.renegociar.removerParcela', { numero: indice + 1 })}
                </Button>
              )}
            </fieldset>
          ))}
          <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            onClick={() => append({ valor: 0, dataVencimento: '' })}
          >
            <PlusIcon aria-hidden />
            {t('contasReceber.renegociar.adicionarParcela')}
          </Button>
          <p
            role={diferenca === 0 ? undefined : 'alert'}
            className={
              diferenca === 0 ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'
            }
          >
            {diferenca === 0
              ? t('contasReceber.renegociar.somaConfere')
              : t(
                  diferenca > 0
                    ? 'contasReceber.renegociar.somaFaltam'
                    : 'contasReceber.renegociar.somaSobram',
                  { diferenca: formatarMoeda(Math.abs(diferenca) / 100) },
                )}
          </p>
        </div>
        <FormField
          name="observacoes"
          label={t('contasReceber.renegociar.observacoes')}
          tipo="textarea"
          className="sm:col-span-2"
        />
      </FormLayout>
    </Modal>
  );
}
