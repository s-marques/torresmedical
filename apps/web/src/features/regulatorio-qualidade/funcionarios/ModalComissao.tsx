import { createComissaoSchema, type Comissao, type ComissaoFormInput } from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { OPCOES_STATUS_COMISSAO } from './opcoes';
import { useCriarComissao, useEditarComissao } from './use-comissoes';

const ID_FORMULARIO = 'form-comissao';

export interface ModalComissaoProps {
  funcionarioId: string;
  /** Sem comissão: "Nova Comissão". Com comissão: "Editar Comissão". */
  comissao?: Comissao;
  onFechar: () => void;
}

function valoresIniciais(c?: Comissao): ComissaoFormInput {
  return {
    valor: c ? Number(c.valor) : 0,
    dataReferencia: c?.dataReferencia ?? '',
    descricao: c?.descricao ?? '',
    status: c?.status ?? 'pendente',
  };
}

/** Modal "Nova Comissão" e "Editar Comissão" (aba "Comissões"), lançamento manual pelo RH. */
export function ModalComissao({ funcionarioId, comissao, onFechar }: Readonly<ModalComissaoProps>) {
  const criar = useCriarComissao(funcionarioId);
  const editar = useEditarComissao(funcionarioId, comissao?.id ?? '');
  const form = useFormulario(createComissaoSchema, { defaultValues: valoresIniciais(comissao) });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={comissao ? 'Editar Comissão' : 'Nova Comissão'}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={comissao ? 'Salvar' : 'Lançar'}
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
          await (comissao ? editar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField name="valor" label="Valor" tipo="moeda" obrigatorio />
        <FormField name="dataReferencia" label="Data de Referência" tipo="data" obrigatorio />
        <FormField name="status" label="Status" tipo="select" opcoes={OPCOES_STATUS_COMISSAO} />
        <FormField name="descricao" label="Descrição" tipo="textarea" className="sm:col-span-2" />
      </FormLayout>
    </Modal>
  );
}
