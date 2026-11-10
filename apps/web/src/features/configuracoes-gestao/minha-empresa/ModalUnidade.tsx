import {
  createUnidadeSchema,
  UNIDADE_UFS,
  type Unidade,
  type UnidadeFormulario,
} from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { OPCOES_UF } from './opcoes';
import { useCriarUnidade, useEditarUnidade } from './use-unidades';

const ID_FORMULARIO = 'form-unidade';

export interface ModalUnidadeProps {
  /** Sem unidade: "Nova Unidade". Com unidade: "Editar Unidade". */
  unidade?: Unidade;
  onFechar: () => void;
}

function valoresIniciais(u?: Unidade): UnidadeFormulario {
  const uf = UNIDADE_UFS.find((sigla) => sigla === u?.uf);
  return {
    nome: u?.nome ?? '',
    endereco: u?.endereco ?? '',
    cidade: u?.cidade ?? '',
    uf: uf ?? '',
    telefone: u?.telefone ?? '',
    cnpj: u?.cnpj ?? '',
    cnes: u?.cnes ?? '',
    ativo: u?.ativo ?? true,
  };
}

/** Modal "Nova Unidade" e "Editar Unidade" (aba Unidades). Só o Nome é obrigatório. */
export function ModalUnidade({ unidade, onFechar }: Readonly<ModalUnidadeProps>) {
  const criar = useCriarUnidade();
  const editar = useEditarUnidade(unidade?.id ?? '');
  const form = useFormulario(createUnidadeSchema, { defaultValues: valoresIniciais(unidade) });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={unidade ? 'Editar Unidade' : 'Nova Unidade'}
      rodape={
        <FormAcoes form={form} formId={ID_FORMULARIO} rotuloEnviar="Salvar" onCancelar={onFechar} />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        colunas={2}
        onSubmit={async (valores) => {
          await (unidade ? editar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField name="nome" label="Nome" obrigatorio className="sm:col-span-2" />
        <FormField name="endereco" label="Endereço" className="sm:col-span-2" />
        <FormField name="cidade" label="Cidade" />
        <FormField name="uf" label="UF" tipo="select" opcoes={OPCOES_UF} />
        <FormField name="telefone" label="Telefone" tipo="telefone" />
        <FormField name="cnpj" label="CNPJ" tipo="cnpj" />
        <FormField name="cnes" label="CNES" descricao="Código CNES (opcional)" />
        <FormField name="ativo" label="Ativo" tipo="switch" />
      </FormLayout>
    </Modal>
  );
}
