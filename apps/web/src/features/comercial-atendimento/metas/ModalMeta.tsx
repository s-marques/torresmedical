import {
  META_METRICA_MONETARIA,
  META_METRICAS,
  META_PERIODO_TIPOS,
  metaComercialInputSchema,
  type MetaComercial,
  type MetaComercialFormulario,
} from '@torres/shared';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { opcoesDePeriodo, periodoAtual } from './formatar-meta';
import { useCriarMeta, useEditarMeta, useResponsaveisMetas } from './use-metas';

const ID_FORMULARIO = 'form-meta-comercial';

export interface ModalMetaProps {
  /** Sem meta: "Nova Meta". Com meta: "Editar Meta". */
  meta?: MetaComercial;
  onFechar: () => void;
}

function valoresIniciais(meta?: MetaComercial): MetaComercialFormulario {
  return {
    metrica: meta?.metrica ?? 'LEADS',
    periodoTipo: meta?.periodoTipo ?? 'MES',
    periodo: meta?.periodo ?? periodoAtual('MES'),
    responsavelId: meta?.responsavelId ?? '',
    valor: (meta?.valor ?? null) as number,
    observacoes: meta?.observacoes ?? '',
  };
}

/**
 * Modal "Nova Meta" e "Editar Meta": métrica do CRM, período (mês ou trimestre), responsável
 * (opcional: sem ele a meta vale para a equipe toda), valor projetado e observações.
 */
export function ModalMeta({ meta, onFechar }: Readonly<ModalMetaProps>) {
  const { t } = useTranslation();
  const criar = useCriarMeta();
  const editar = useEditarMeta(meta?.id ?? '');
  const responsaveis = useResponsaveisMetas();
  const form = useFormulario(metaComercialInputSchema, { defaultValues: valoresIniciais(meta) });
  const metrica = form.watch('metrica');
  const periodoTipo = form.watch('periodoTipo');
  const opcoes = useMemo(() => opcoesDePeriodo(t, periodoTipo), [t, periodoTipo]);

  // Trocar de mês para trimestre (ou o contrário) pede outro formato: volta ao período corrente.
  useEffect(() => {
    const atual = form.getValues('periodo');
    if (!opcoes.some((o) => o.valor === atual) && !(meta && atual === meta.periodo)) {
      form.setValue('periodo', periodoAtual(periodoTipo));
    }
  }, [opcoes, periodoTipo, form, meta]);

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={meta ? t('metas.modal.tituloEditar') : t('metas.modal.tituloNova')}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={meta ? t('comum.salvar') : t('metas.modal.criar')}
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await (meta ? editar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField
          name="metrica"
          label={t('metas.campos.metrica')}
          tipo="select"
          obrigatorio
          opcoes={META_METRICAS.map((valor) => ({ valor, rotulo: t(`metas.metricas.${valor}`) }))}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            name="periodoTipo"
            label={t('metas.campos.periodoTipo')}
            tipo="select"
            obrigatorio
            opcoes={META_PERIODO_TIPOS.map((valor) => ({
              valor,
              rotulo: t(`metas.periodoTipos.${valor}`),
            }))}
          />
          <FormField
            name="periodo"
            label={t('metas.campos.periodo')}
            tipo="select"
            obrigatorio
            opcoes={opcoes}
          />
        </div>
        <FormField
          name="responsavelId"
          label={t('metas.campos.responsavel')}
          tipo="select"
          placeholder={t('metas.campos.responsavelEquipe')}
          opcoes={(responsaveis.data ?? []).map((r) => ({ valor: r.id, rotulo: r.nome }))}
        />
        <FormField
          name="valor"
          label={t('metas.campos.valor')}
          tipo={metrica === META_METRICA_MONETARIA ? 'moeda' : 'numero'}
          obrigatorio
        />
        <FormField
          name="observacoes"
          label={t('metas.campos.observacoes')}
          tipo="textarea"
          placeholder={t('metas.campos.observacoesPlaceholder')}
        />
      </FormLayout>
    </Modal>
  );
}
