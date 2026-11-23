import {
  createEncaminhamentoSchema,
  type Encaminhamento,
  type EncaminhamentoFormulario,
} from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import {
  useEditarEncaminhamento,
  useProfissionaisEncaminhamento,
  useRegistrarEncaminhamento,
} from './use-encaminhamentos';

const ID_FORMULARIO = 'form-encaminhamento';

export interface ModalEncaminhamentoProps {
  /** Sem encaminhamento: "Novo Encaminhamento". Com encaminhamento: "Editar Encaminhamento". */
  encaminhamento?: Encaminhamento;
  onFechar: () => void;
}

function valoresIniciais(e?: Encaminhamento): EncaminhamentoFormulario {
  return {
    pacienteId: e?.pacienteId ?? '',
    origemProfissionalId: e?.origemProfissionalId ?? '',
    destinoProfissionalId: e?.destinoProfissionalId ?? '',
    especialidadeId: e?.especialidadeId ?? null,
    // O modal já abre com a data de hoje (dia do calendário local).
    data: e?.data ?? new Date().toLocaleDateString('en-CA'),
    motivo: e?.motivo ?? '',
  };
}

/**
 * Modal "Novo Encaminhamento" e "Editar Encaminhamento" (issue #146, R §26). Origem e destino
 * só listam profissionais com contrato que permite indicação; a origem respeita o escopo do
 * usuário. Registrado pelo profissional de origem ou pela recepção.
 */
export function ModalEncaminhamento({
  encaminhamento,
  onFechar,
}: Readonly<ModalEncaminhamentoProps>) {
  const { t } = useTranslation();
  const registrar = useRegistrarEncaminhamento();
  const editar = useEditarEncaminhamento(encaminhamento?.id ?? '');
  const profissionais = useProfissionaisEncaminhamento();
  const form = useFormulario(createEncaminhamentoSchema, {
    defaultValues: valoresIniciais(encaminhamento),
  });
  const opcoes = (itens: { id: string; label: string }[] = []) =>
    itens.map(({ id, label }) => ({ valor: id, rotulo: label }));
  const c = (chave: string) => t(`encaminhamentos.campos.${chave}`);

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={encaminhamento ? t('encaminhamentos.editarTitulo') : t('encaminhamentos.novoTitulo')}
      descricao={t('encaminhamentos.aviso')}
      tamanho="lg"
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={encaminhamento ? t('comum.salvar') : t('encaminhamentos.registrar')}
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await (encaminhamento ? editar : registrar).mutateAsync(valores);
          onFechar();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            name="pacienteId"
            label={c('paciente')}
            tipo="entidade"
            entidade="pacientes"
            obrigatorio
            className="sm:col-span-2"
          />
          <FormField
            name="origemProfissionalId"
            label={c('origem')}
            tipo="select"
            opcoes={opcoes(profissionais.data?.origens)}
            obrigatorio
          />
          <FormField
            name="destinoProfissionalId"
            label={c('destino')}
            tipo="select"
            opcoes={opcoes(profissionais.data?.destinos)}
            obrigatorio
          />
          <FormField
            name="especialidadeId"
            label={c('especialidade')}
            tipo="entidade"
            entidade="especialidades"
          />
          <FormField name="data" label={c('data')} tipo="data" />
          <FormField name="motivo" label={c('motivo')} tipo="textarea" className="sm:col-span-2" />
        </div>
      </FormLayout>
    </Modal>
  );
}
