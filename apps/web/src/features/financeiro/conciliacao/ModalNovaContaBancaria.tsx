import {
  CONTA_BANCARIA_ROTULO_TIPO,
  CONTA_BANCARIA_TIPOS,
  contaBancariaInputSchema,
  type ContaBancariaFormulario,
} from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import type { OpcaoCampo } from '@/components/shared/form/tipos';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useCriarContaBancaria } from '../contas-bancarias/use-contas-bancarias';

const OPCOES_TIPO: readonly OpcaoCampo[] = CONTA_BANCARIA_TIPOS.map((tipo) => ({
  valor: tipo,
  rotulo: CONTA_BANCARIA_ROTULO_TIPO[tipo],
}));

const VALORES_INICIAIS: ContaBancariaFormulario = {
  nome: '',
  tipo: 'CORRENTE',
  banco: '',
  agencia: '',
  conta: '',
  saldoInicial: null,
  dataSaldoInicial: '',
};

const FORM_ID = 'form-conta-bancaria';

/**
 * Modal "Nova Conta" (aba "Contas Bancárias"). Campos confirmados pelo dev na #46; validação com
 * a mensagem padrão de obrigatório (o item 👤 de validação do card não tem print).
 */
export function ModalNovaContaBancaria({ onFechar }: Readonly<{ onFechar: () => void }>) {
  const criar = useCriarContaBancaria();
  const form = useFormulario(contaBancariaInputSchema, { defaultValues: VALORES_INICIAIS });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Nova Conta"
      rodape={
        <FormAcoes form={form} formId={FORM_ID} rotuloEnviar="Cadastrar" onCancelar={onFechar} />
      }
    >
      <FormLayout
        id={FORM_ID}
        form={form}
        acoes={null}
        colunas={2}
        onSubmit={async (valores) => {
          await criar.mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField name="nome" label="Nome" obrigatorio className="sm:col-span-2" />
        <FormField name="tipo" label="Tipo" tipo="select" opcoes={OPCOES_TIPO} obrigatorio />
        <FormField name="banco" label="Banco" />
        <FormField name="agencia" label="Agência" />
        <FormField name="conta" label="Conta" />
        <FormField name="saldoInicial" label="Saldo Inicial" tipo="moeda" />
        <FormField
          name="dataSaldoInicial"
          label="Data do Saldo Inicial"
          tipo="data"
          descricao="Pagamentos e recebimentos a partir desta data somam no saldo."
        />
      </FormLayout>
    </Modal>
  );
}
