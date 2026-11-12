import {
  pacoteInputSchema,
  somarItensPacote,
  type Pacote,
  type PacoteFormulario,
} from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { ItensPacote, type InfoItemPacote } from './ItensPacote';
import { useCriarPacote, useEditarPacote } from './use-pacotes';

const ID_FORMULARIO = 'form-pacote';

function valoresIniciais(pacote?: Pacote): PacoteFormulario {
  const soma = pacote
    ? somarItensPacote(
        pacote.itens.map((i) => ({
          quantidade: i.quantidade,
          valorUnitario: Number(i.valorUnitario),
        })),
      )
    : 0;
  return {
    // Obrigatório no schema; vazio no formulário até o usuário escolher (o seletor usa `null`).
    pacienteId: (pacote?.pacienteId ?? null) as string,
    nome: pacote?.nome ?? '',
    descricao: pacote?.descricao ?? '',
    itens: pacote?.itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade })) ?? [],
    // Só mostra o valor quando foi digitado: o que é igual à soma dos itens é automático.
    valorTotal: pacote && Number(pacote.valorTotal) !== soma ? Number(pacote.valorTotal) : null,
    dataInicio: pacote?.dataInicio ?? '',
    dataVencimento: pacote?.dataVencimento ?? '',
    profissionalId: pacote?.profissionalId ?? null,
    observacoes: pacote?.observacoes ?? '',
  };
}

function infoDosItens(pacote?: Pacote): Record<string, InfoItemPacote> {
  return Object.fromEntries(
    (pacote?.itens ?? []).map((i) => [
      i.produtoId,
      { nome: i.descricao, valor: Number(i.valorUnitario) },
    ]),
  );
}

export interface ModalPacoteProps {
  /** Sem pacote: "Novo Pacote". Com pacote: "Editar Pacote". */
  pacote?: Pacote;
  onFechar: () => void;
}

/** Modal "Novo Pacote" e "Editar Pacote" (`/pacotes`). */
export function ModalPacote({ pacote, onFechar }: Readonly<ModalPacoteProps>) {
  const criar = useCriarPacote();
  const editar = useEditarPacote(pacote?.id ?? '');
  const form = useFormulario(pacoteInputSchema, { defaultValues: valoresIniciais(pacote) });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={pacote ? 'Editar Pacote' : 'Novo Pacote'}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={pacote ? 'Salvar' : 'Cadastrar'}
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await (pacote ? editar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField
          name="pacienteId"
          label="Cliente"
          tipo="entidade"
          entidade="pacientes"
          placeholder="Buscar paciente por nome..."
          obrigatorio
        />
        <FormField
          name="nome"
          label="Nome do Pacote"
          placeholder="Ex: Pacote 10 Sessões Fisioterapia"
          obrigatorio
        />
        <FormField
          name="descricao"
          label="Descrição"
          tipo="textarea"
          placeholder="Descrição do pacote..."
        />
        <ItensPacote iniciais={infoDosItens(pacote)} />
        <FormField
          name="valorTotal"
          label="Valor Total do Pacote (R$)"
          tipo="moeda"
          descricao="opcional - sobrescreve a soma dos itens"
          placeholder="Calculado automaticamente dos itens"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="dataInicio" label="Data Início" tipo="data" />
          <FormField name="dataVencimento" label="Data Vencimento" tipo="data" />
        </div>
        <FormField
          name="profissionalId"
          label="Profissional"
          tipo="entidade"
          entidade="profissionais"
          placeholder="Selecione (opcional)"
        />
        <FormField
          name="observacoes"
          label="Observações"
          tipo="textarea"
          placeholder="Observações adicionais..."
        />
      </FormLayout>
    </Modal>
  );
}
