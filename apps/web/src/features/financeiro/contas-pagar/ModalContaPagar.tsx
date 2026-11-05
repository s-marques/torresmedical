import { contaPagarInputSchema, type ContaPagar, type ContaPagarFormulario } from '@torres/shared';
import { useId } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { usePlanoContas } from '../plano-contas/use-plano-contas';
import { OPCOES_STATUS } from './opcoes';
import { useCriarContaPagar, useEditarContaPagar } from './use-contas-pagar';

const ID_FORMULARIO = 'form-conta-pagar';

function valoresIniciais(conta?: ContaPagar): ContaPagarFormulario {
  return {
    descricao: conta?.descricao ?? '',
    beneficiarioTipo: conta?.beneficiarioTipo ?? 'FORNECEDOR',
    beneficiarioId: conta?.beneficiarioId ?? null,
    valor: conta ? Number(conta.valor) : 0,
    dataVencimento: conta?.dataVencimento ?? '',
    formaPagamentoId: conta?.formaPagamentoId ?? null,
    planoContaId: conta?.planoContaId ?? null,
    documento: conta?.documento ?? '',
    totalParcelas: conta?.totalParcelas ?? 1,
    status: conta?.status ?? 'PENDENTE',
    observacoes: conta?.observacoes ?? '',
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
  const planoContas = usePlanoContas({ search: '' });
  const opcoesPlanoContas = (planoContas.data?.data ?? []).map((pc) => ({
    valor: pc.id,
    rotulo: `${pc.codigo} - ${pc.nome}`,
  }));

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={conta ? 'Editar Conta a Pagar' : 'Nova Conta a Pagar'}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={conta ? 'Salvar' : 'Cadastrar'}
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
          await (conta ? editar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField name="descricao" label="Descrição" obrigatorio className="sm:col-span-2" />
        <CampoBeneficiario />
        <FormField name="valor" label="Valor" tipo="moeda" obrigatorio />
        <FormField name="dataVencimento" label="Data de Vencimento" tipo="data" obrigatorio />
        <FormField
          name="formaPagamentoId"
          label="Forma de Pagamento"
          tipo="entidade"
          entidade="formas-pagamento"
          filtros={{ finalidade: 'pagar' }}
          placeholder="Selecione"
        />
        <FormField
          name="planoContaId"
          label="Plano de Contas"
          tipo="select"
          opcoes={opcoesPlanoContas}
          placeholder="Selecione (opcional)"
        />
        <FormField name="documento" label="Documento" />
        <FormField name="totalParcelas" label="Total Parcelas" tipo="numero" />
        <FormField name="status" label="Status" tipo="select" opcoes={OPCOES_STATUS} />
        <FormField
          name="observacoes"
          label="Observações"
          tipo="textarea"
          className="sm:col-span-2"
        />
      </FormLayout>
    </Modal>
  );
}
