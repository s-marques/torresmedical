import {
  PACIENTE_CANAIS_ORIGEM,
  PACIENTE_INDICACAO_TIPOS,
  PACIENTE_PREFERENCIAS_COMUNICACAO,
  type PacienteInput,
} from '@torres/shared';
import { useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/shared/form/FormField';

/**
 * Campos de relacionamento do cadastro (issue #148): canal de origem, WhatsApp, preferência de
 * comunicação, quem indicou (paciente, profissional do Torres ou texto livre) e o profissional e a
 * especialidade de vínculo. Precisa estar dentro de um `FormLayout` do paciente.
 */
export function CamposRelacionamento() {
  const { t } = useTranslation();
  const indicacaoTipo = useWatch<PacienteInput, 'indicacaoTipo'>({ name: 'indicacaoTipo' });
  const canais = PACIENTE_CANAIS_ORIGEM.map((valor) => ({
    valor,
    rotulo: t(`pacientes.canais.${valor}`),
  }));
  const preferencias = PACIENTE_PREFERENCIAS_COMUNICACAO.map((valor) => ({
    valor,
    rotulo: t(`pacientes.preferencias.${valor}`),
  }));
  const tiposIndicacao = PACIENTE_INDICACAO_TIPOS.map((valor) => ({
    valor,
    rotulo: t(`pacientes.indicacaoTipos.${valor}`),
  }));

  return (
    <fieldset className="grid gap-4 border-t pt-4 sm:col-span-2 sm:grid-cols-2">
      <legend className="pr-2 text-sm font-semibold">{t('pacientes.relacionamento.titulo')}</legend>
      <FormField
        name="canalOrigem"
        label={t('pacientes.relacionamento.canalOrigem')}
        tipo="select"
        opcoes={canais}
      />
      <FormField
        name="preferenciaComunicacao"
        label={t('pacientes.relacionamento.preferenciaComunicacao')}
        tipo="select"
        opcoes={preferencias}
      />
      <FormField
        name="whatsapp"
        label={t('pacientes.relacionamento.whatsapp')}
        tipo="telefone"
        descricao={t('pacientes.relacionamento.whatsappDica')}
        className="sm:col-span-2"
      />
      <FormField
        name="indicacaoTipo"
        label={t('pacientes.relacionamento.indicadoPorTipo')}
        tipo="select"
        opcoes={tiposIndicacao}
      />
      {indicacaoTipo === 'PACIENTE' && (
        <FormField
          name="indicacaoReferenciaId"
          label={t('pacientes.relacionamento.indicadoPaciente')}
          tipo="entidade"
          entidade="pacientes"
          obrigatorio
        />
      )}
      {indicacaoTipo === 'PROFISSIONAL' && (
        <FormField
          name="indicacaoReferenciaId"
          label={t('pacientes.relacionamento.indicadoProfissional')}
          tipo="entidade"
          entidade="profissionais"
          obrigatorio
        />
      )}
      {indicacaoTipo === 'TEXTO' && (
        <FormField
          name="indicacaoTexto"
          label={t('pacientes.relacionamento.indicadoTexto')}
          obrigatorio
        />
      )}
      <FormField
        name="profissionalVinculoId"
        label={t('pacientes.relacionamento.profissionalVinculo')}
        tipo="entidade"
        entidade="profissionais"
      />
      <FormField
        name="especialidadeVinculoId"
        label={t('pacientes.relacionamento.especialidadeVinculo')}
        tipo="entidade"
        entidade="especialidades"
      />
    </fieldset>
  );
}
