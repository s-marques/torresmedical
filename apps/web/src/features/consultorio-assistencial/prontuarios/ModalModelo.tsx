import {
  MODELO_PROFISSOES,
  modeloAtualizacaoSchema,
  modeloPadraoInputSchema,
  modeloProprioInputSchema,
  type ModeloProntuario,
  type ModeloProprioFormulario,
} from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { secaoVazia } from './campos-modelo';
import { EditorSecoesModelo } from './EditorSecoesModelo';
import { useAtualizarModelo, useCriarModelo } from './use-modelos-prontuario';

const ID_FORMULARIO = 'form-modelo-prontuario';

export interface ModalModeloProps {
  /** Modelo a editar; sem ele o modal cria um novo. */
  modelo?: ModeloProntuario;
  /** Modelo padrão da clínica (gerência) em vez do modelo de um profissional. */
  padrao: boolean;
  onFechar: () => void;
}

/**
 * Cria ou edita um modelo de prontuário (issue #152): nome, profissão, especialidade e as
 * seções com seus campos. Alterar nome ou seções cria uma nova versão; os atendimentos já
 * registrados continuam com a versão que usaram.
 */
export function ModalModelo({ modelo, padrao, onFechar }: Readonly<ModalModeloProps>) {
  const { t } = useTranslation();
  const criar = useCriarModelo(padrao);
  const atualizar = useAtualizarModelo(modelo?.id ?? '', padrao);
  const schema = modelo
    ? modeloAtualizacaoSchema
    : padrao
      ? modeloPadraoInputSchema
      : modeloProprioInputSchema;
  const form = useFormulario(schema as typeof modeloProprioInputSchema, {
    defaultValues: (modelo
      ? {
          nome: modelo.nome,
          profissao: modelo.profissao,
          especialidade: modelo.especialidade ?? '',
          ativo: modelo.ativo,
          secoes: modelo.secoes,
        }
      : {
          nome: '',
          profissao: 'MEDICO',
          especialidade: '',
          profissionalId: null,
          ativo: true,
          secoes: [secaoVazia()],
        }) as unknown as ModeloProprioFormulario,
  });
  const profissoes = MODELO_PROFISSOES.map((valor) => ({
    valor,
    rotulo: t(`modelosProntuario.profissoes.${valor}`),
  }));

  async function salvar(valores: Record<string, unknown>) {
    if (modelo) await atualizar.mutateAsync(valores);
    else await criar.mutateAsync(valores as never);
    onFechar();
  }

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={t(
        modelo
          ? padrao
            ? 'modelosProntuario.editarPadrao'
            : 'modelosProntuario.editar'
          : padrao
            ? 'modelosProntuario.novoPadrao'
            : 'modelosProntuario.novo',
      )}
      descricao={t('modelosProntuario.aviso')}
      tamanho="xl"
      rodape={<FormAcoes form={form} formId={ID_FORMULARIO} onCancelar={onFechar} />}
    >
      <FormLayout id={ID_FORMULARIO} form={form} acoes={null} colunas={2} onSubmit={salvar}>
        <FormField name="nome" label={t('modelosProntuario.campos.nome')} obrigatorio />
        <FormField
          name="profissao"
          label={t('modelosProntuario.campos.profissao')}
          tipo="select"
          opcoes={profissoes}
          obrigatorio
        />
        <FormField name="especialidade" label={t('modelosProntuario.campos.especialidade')} />
        {!padrao && !modelo && (
          <FormField
            name="profissionalId"
            label={t('modelosProntuario.campos.profissional')}
            tipo="entidade"
            entidade="profissionais"
            obrigatorio
          />
        )}
        <FormField name="ativo" label={t('modelosProntuario.campos.ativo')} tipo="switch" />
        <EditorSecoesModelo />
      </FormLayout>
    </Modal>
  );
}
