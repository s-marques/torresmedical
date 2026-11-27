import {
  updateReceitaProfissionalSchema,
  type ReceitaProfissional,
  type ReceitaProfissionalFormulario,
} from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/shared/form/FormField';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { ModalContaFinanceira } from '../../financeiro/contas-financeiras/ModalContaFinanceira';
import { valoresIniciaisContaFinanceira } from '../../financeiro/contas-financeiras/valores-iniciais';
import { OPCOES_STATUS } from '../../financeiro/contas-receber/opcoes';
import { CamposRecebimento } from '../../financeiro/contas-receber/ModalContaReceber';
import { useEditarReceita } from './use-receita-profissionais';

function valoresIniciais(receita: ReceitaProfissional): ReceitaProfissionalFormulario {
  return {
    ...valoresIniciaisContaFinanceira(receita),
    profissionalId: receita.profissionalId,
    pacienteId: receita.pacienteId,
    // Parcial e Renegociado só existem em Contas a Receber (issue #165): a receita não os usa.
    status:
      receita.status === 'RECEBIDO' || receita.status === 'CANCELADO' ? receita.status : 'PENDENTE',
    contaBancariaId: receita.contaBancariaId,
    dataRecebimento: receita.dataRecebimento ?? '',
  };
}

/**
 * Ação "Editar" da linha: os mesmos campos de Editar Conta a Receber, mais o Profissional. A tela
 * não tem "Novo": as receitas vêm do atendimento e do financeiro.
 */
export function ModalReceita({
  receita,
  onFechar,
}: Readonly<{ receita: ReceitaProfissional; onFechar: () => void }>) {
  const { t } = useTranslation();
  const editar = useEditarReceita(receita.id);
  const form = useFormulario(updateReceitaProfissionalSchema, {
    defaultValues: valoresIniciais(receita),
  });

  return (
    <ModalContaFinanceira
      titulo={t('receitaProfissionais.editarTitulo')}
      editando
      form={form}
      formId="form-receita-profissional"
      onSubmit={(valores) => editar.mutateAsync(valores)}
      onFechar={onFechar}
      finalidade="receber"
      opcoesStatus={OPCOES_STATUS}
      pessoa={
        <>
          <FormField
            name="profissionalId"
            label={t('receitaProfissionais.profissional')}
            tipo="entidade"
            entidade="profissionais"
            obrigatorio
          />
          <FormField
            name="pacienteId"
            label={t('receitaProfissionais.paciente')}
            tipo="entidade"
            entidade="pacientes"
          />
        </>
      }
      aposStatus={<CamposRecebimento />}
    />
  );
}
