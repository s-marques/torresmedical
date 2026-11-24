import {
  CONSENTIMENTO_CANAIS,
  CONSENTIMENTO_TIPOS,
  createConsentimentoSchema,
  type Consentimento,
  type ConsentimentoInput,
  type ConsentimentoTipo,
} from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { formatarDataHora } from '@/lib/formatar';
import { useConsentimentos, useRegistrarConsentimento } from './use-pacientes';

/** O consentimento vigente de cada tipo é o registro mais recente (a API já ordena). */
function vigentes(historico: readonly Consentimento[]): Map<ConsentimentoTipo, Consentimento> {
  const mapa = new Map<ConsentimentoTipo, Consentimento>();
  for (const registro of historico) {
    if (!mapa.has(registro.tipo)) mapa.set(registro.tipo, registro);
  }
  return mapa;
}

export interface ConsentimentosPacienteProps {
  pacienteId: string;
}

/**
 * Consentimentos LGPD do paciente (issue #148): o vigente de cada tipo, o histórico completo (a
 * revogação não apaga nada) e o formulário para registrar um aceite ou uma revogação.
 */
export function ConsentimentosPaciente({ pacienteId }: Readonly<ConsentimentosPacienteProps>) {
  const { t } = useTranslation();
  const consulta = useConsentimentos(pacienteId);
  const historico = consulta.data?.data ?? [];
  const atuais = vigentes(historico);

  return (
    <section aria-labelledby="titulo-consentimentos" className="grid gap-4 border-t pt-4">
      <div className="grid gap-1">
        <h3 id="titulo-consentimentos" className="text-sm font-semibold">
          {t('pacientes.consentimentos.titulo')}
        </h3>
        <p className="text-xs text-muted-foreground">{t('pacientes.consentimentos.descricao')}</p>
      </div>

      {consulta.isPending && (
        <p className="text-sm text-muted-foreground">{t('pacientes.consentimentos.carregando')}</p>
      )}
      {consulta.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t('pacientes.consentimentos.erro')}
        </p>
      )}

      {consulta.isSuccess && (
        <>
          <ul
            className="grid gap-2 sm:grid-cols-3"
            aria-label={t('pacientes.consentimentos.titulo')}
          >
            {CONSENTIMENTO_TIPOS.map((tipo) => (
              <SituacaoDoTipo key={tipo} tipo={tipo} registro={atuais.get(tipo)} />
            ))}
          </ul>
          <Historico historico={historico} />
          <SePermitido permissao="comercial-atendimento.pacientes.editar">
            <RegistrarConsentimento pacienteId={pacienteId} />
          </SePermitido>
        </>
      )}
    </section>
  );
}

function SituacaoDoTipo({
  tipo,
  registro,
}: Readonly<{ tipo: ConsentimentoTipo; registro: Consentimento | undefined }>) {
  const { t } = useTranslation();
  const situacao = registro ? (registro.aceito ? 'aceito' : 'recusado') : 'semRegistro';
  const tom = { aceito: 'sucesso', recusado: 'perigo', semRegistro: 'neutro' } as const;
  return (
    <li className="grid gap-1 rounded-md border p-3">
      <span className="text-sm font-medium">{t(`pacientes.consentimentos.tipos.${tipo}`)}</span>
      <span className="text-xs text-muted-foreground">
        {t(`pacientes.consentimentos.dicaTipo.${tipo}`)}
      </span>
      <StatusBadge tom={tom[situacao]}>
        {t(`pacientes.consentimentos.situacao.${situacao}`)}
      </StatusBadge>
      {registro && (
        <span className="text-xs text-muted-foreground">
          {formatarDataHora(registro.registradoEm)}
        </span>
      )}
    </li>
  );
}

function Historico({ historico }: Readonly<{ historico: readonly Consentimento[] }>) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-2">
      <h4 className="text-sm font-medium">{t('pacientes.consentimentos.historico')}</h4>
      {historico.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('pacientes.consentimentos.semHistorico')}
        </p>
      ) : (
        <ol className="grid gap-2">
          {historico.map((registro) => (
            <li
              key={registro.id}
              className="grid gap-0.5 rounded-md border p-2 text-sm"
              data-testid="consentimento-historico"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {t(`pacientes.consentimentos.tipos.${registro.tipo}`)}
                </span>
                <StatusBadge tom={registro.aceito ? 'sucesso' : 'perigo'}>
                  {t(
                    registro.aceito
                      ? 'pacientes.consentimentos.situacao.aceito'
                      : 'pacientes.consentimentos.situacao.recusado',
                  )}
                </StatusBadge>
              </span>
              <span className="text-xs text-muted-foreground">
                {formatarDataHora(registro.registradoEm)} ·{' '}
                {t(`pacientes.consentimentos.canais.${registro.canal}`)}
                {registro.registradoPorNome &&
                  ` · ${t('pacientes.consentimentos.registradoPor', { nome: registro.registradoPorNome })}`}
              </span>
              {registro.observacao && <span className="text-xs">{registro.observacao}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function RegistrarConsentimento({ pacienteId }: Readonly<{ pacienteId: string }>) {
  const { t } = useTranslation();
  const registrar = useRegistrarConsentimento(pacienteId);
  const form = useFormulario(createConsentimentoSchema, {
    defaultValues: { tipo: 'CAMPANHAS', aceito: true, canal: 'PRESENCIAL', observacao: '' },
  });
  const tipos = CONSENTIMENTO_TIPOS.map((valor) => ({
    valor,
    rotulo: t(`pacientes.consentimentos.tipos.${valor}`),
  }));
  const canais = CONSENTIMENTO_CANAIS.map((valor) => ({
    valor,
    rotulo: t(`pacientes.consentimentos.canais.${valor}`),
  }));

  return (
    <div className="grid gap-3 rounded-md border bg-muted/30 p-3">
      <h4 className="text-sm font-medium">{t('pacientes.consentimentos.registrar.titulo')}</h4>
      <FormLayout
        form={form}
        colunas={2}
        rotuloEnviar={t('pacientes.consentimentos.registrar.botao')}
        onSubmit={async (valores) => {
          await registrar.mutateAsync(valores as ConsentimentoInput);
          form.reset({ tipo: valores.tipo, aceito: true, canal: valores.canal, observacao: '' });
        }}
      >
        <FormField
          name="tipo"
          label={t('pacientes.consentimentos.registrar.tipo')}
          tipo="select"
          opcoes={tipos}
        />
        <FormField
          name="canal"
          label={t('pacientes.consentimentos.registrar.canal')}
          tipo="select"
          opcoes={canais}
        />
        <FormField
          name="aceito"
          label={t('pacientes.consentimentos.registrar.aceito')}
          tipo="switch"
          descricao={t('pacientes.consentimentos.registrar.aceitoDica')}
          className="sm:col-span-2"
        />
        <FormField
          name="observacao"
          label={t('pacientes.consentimentos.registrar.observacao')}
          tipo="textarea"
          className="sm:col-span-2"
        />
      </FormLayout>
    </div>
  );
}
