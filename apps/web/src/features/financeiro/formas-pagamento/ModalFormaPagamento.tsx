import {
  createFormaPagamentoSchema,
  type FormaPagamento,
  type FormaPagamentoFormulario,
  type FormaPagamentoTipo,
} from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { OPCOES_FINALIDADE, OPCOES_TIPO } from './opcoes';
import { useCriarForma, useEditarForma } from './use-formas-pagamento';

const ID_FORMULARIO = 'form-forma-pagamento';

function valoresIniciais(forma?: FormaPagamento): FormaPagamentoFormulario {
  return {
    nome: forma?.nome ?? '',
    finalidade: forma?.finalidade === 'PAGAR' ? 'pagar' : 'receber',
    tipo: (forma?.tipo.toLowerCase() as FormaPagamentoTipo | undefined) ?? 'dinheiro',
    prazoRecebimentoDias: forma?.prazoRecebimentoDias ?? 0,
    maxParcelas: forma?.maxParcelas ?? 1,
    movimentaContaBancaria: forma?.movimentaContaBancaria ?? true,
  };
}

export interface ModalFormaPagamentoProps {
  /** Sem forma: "Nova Forma de Pagamento" (Criar). Com forma: "Editar Forma de Pagamento" (Salvar). */
  forma?: FormaPagamento;
  onFechar: () => void;
}

export function ModalFormaPagamento({ forma, onFechar }: Readonly<ModalFormaPagamentoProps>) {
  const criar = useCriarForma();
  const editar = useEditarForma(forma?.id ?? '');
  const form = useFormulario(createFormaPagamentoSchema, {
    defaultValues: valoresIniciais(forma),
  });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={forma ? 'Editar Forma de Pagamento' : 'Nova Forma de Pagamento'}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={forma ? 'Salvar' : 'Criar'}
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
          await (forma ? editar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField
          name="nome"
          label="Nome"
          obrigatorio
          placeholder="Nome da forma de pagamento"
          className="sm:col-span-2"
        />
        <FormField name="finalidade" label="Finalidade" tipo="select" opcoes={OPCOES_FINALIDADE} />
        <FormField name="tipo" label="Tipo" tipo="select" opcoes={OPCOES_TIPO} />
        <FormField name="prazoRecebimentoDias" label="Prazo Recebimento (dias)" tipo="numero" />
        <FormField
          name="maxParcelas"
          label="Max. Parcelas"
          tipo="numero"
          descricao="Ex: 12 para até 12x"
        />
        <FormField
          name="movimentaContaBancaria"
          label="Movimenta conta bancária"
          tipo="checkbox"
          descricao="Desmarque para formas como Permuta, Cortesia ou Convênio que não movimentam dinheiro."
          className="sm:col-span-2"
        />
      </FormLayout>
    </Modal>
  );
}
