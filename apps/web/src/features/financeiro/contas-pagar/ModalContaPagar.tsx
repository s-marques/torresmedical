import { contaPagarInputSchema, type ContaPagar, type ContaPagarFormulario } from '@torres/shared';
import { useId } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { FormField } from '@/components/shared/form/FormField';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ModalContaFinanceira } from '../contas-financeiras/ModalContaFinanceira';
import { valoresIniciaisContaFinanceira } from '../contas-financeiras/valores-iniciais';
import { OPCOES_STATUS } from './opcoes';
import { useCriarContaPagar, useEditarContaPagar } from './use-contas-pagar';

function valoresIniciais(conta?: ContaPagar): ContaPagarFormulario {
  return {
    ...valoresIniciaisContaFinanceira(conta),
    beneficiarioTipo: conta?.beneficiarioTipo ?? 'FORNECEDOR',
    beneficiarioId: conta?.beneficiarioId ?? null,
    status: conta?.status ?? 'PENDENTE',
  };
}

/** Rótulo do campo e o checkbox "Funcionário" (desmarcado = Fornecedor, o padrão). */
function CampoBeneficiario() {
  const id = useId();
  const { control, setValue } = useFormContext<ContaPagarFormulario>();
  return (
    <div className="grid content-start gap-2 sm:col-span-2">
      <div className="flex items-center justify-between">
        <Controller
          control={control}
          name="beneficiarioTipo"
          render={({ field }) => (
            <>
              <Label htmlFor={id}>
                {field.value === 'FUNCIONARIO' ? 'Funcionário' : 'Fornecedor'}
              </Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`${id}-funcionario`}
                  checked={field.value === 'FUNCIONARIO'}
                  onCheckedChange={(marcado) => {
                    field.onChange(marcado === true ? 'FUNCIONARIO' : 'FORNECEDOR');
                    setValue('beneficiarioId', null);
                  }}
                />
                <Label htmlFor={`${id}-funcionario`} className="font-normal">
                  Funcionário
                </Label>
              </div>
            </>
          )}
        />
      </div>
      <Controller
        control={control}
        name="beneficiarioTipo"
        render={({ field: tipo }) => (
          <FormField
            name="beneficiarioId"
            label="Beneficiário"
            tipo="entidade"
            entidade={tipo.value === 'FUNCIONARIO' ? 'funcionarios' : 'fornecedores'}
            placeholder={
              tipo.value === 'FUNCIONARIO' ? 'Selecione o funcionário' : 'Selecione o fornecedor'
            }
            className="[&_label]:sr-only"
          />
        )}
      />
    </div>
  );
}

export interface ModalContaPagarProps {
  /** Sem conta: "Nova Conta a Pagar". Com conta: "Editar Conta a Pagar". */
  conta?: ContaPagar;
  onFechar: () => void;
}

/** Modal "Nova Conta a Pagar" e "Editar Conta a Pagar" (`/pagar`). */
export function ModalContaPagar({ conta, onFechar }: Readonly<ModalContaPagarProps>) {
  const criar = useCriarContaPagar();
  const editar = useEditarContaPagar(conta?.id ?? '');
  const form = useFormulario(contaPagarInputSchema, { defaultValues: valoresIniciais(conta) });

  return (
    <ModalContaFinanceira
      titulo={conta ? 'Editar Conta a Pagar' : 'Nova Conta a Pagar'}
      editando={Boolean(conta)}
      form={form}
      formId="form-conta-pagar"
      onSubmit={(valores) => (conta ? editar : criar).mutateAsync(valores)}
      onFechar={onFechar}
      finalidade="pagar"
      opcoesStatus={OPCOES_STATUS}
      pessoa={<CampoBeneficiario />}
    />
  );
}
