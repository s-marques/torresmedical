import {
  PESQUISA_PROFISSIONAL_PERIODICIDADE_MAX_MESES,
  pesquisaProfissionalConfigInputSchema,
  type PesquisaProfissionalConfig,
} from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { usePermissao } from '@/lib/auth/use-sessao';
import {
  useConfigPesquisaProfissional,
  useSalvarConfigPesquisaProfissional,
} from './use-pesquisa-profissional';

const PERMISSAO_EDITAR = 'comercial-atendimento.pesquisa-profissional.editar';

function Formulario({ config }: Readonly<{ config: PesquisaProfissionalConfig }>) {
  const { t } = useTranslation();
  const salvar = useSalvarConfigPesquisaProfissional();
  const podeEditar = usePermissao(PERMISSAO_EDITAR);
  const form = useFormulario(pesquisaProfissionalConfigInputSchema, {
    defaultValues: {
      ativo: config.ativo,
      periodicidadeMeses: config.periodicidadeMeses,
      mensagem: config.mensagem,
    },
  });
  const c = (chave: string) => t(`pesquisaProfissional.configuracao.${chave}`);

  return (
    <FormLayout
      form={form}
      // Quem só vê a configuração não tem botão Salvar.
      acoes={podeEditar ? undefined : null}
      onSubmit={(valores) => salvar.mutateAsync(valores)}
    >
      <div className="grid gap-4">
        <FormField
          name="ativo"
          label={c('campos.ativo')}
          tipo="switch"
          descricao={c('ajuda.ativo')}
          disabled={!podeEditar}
        />
        <FormField
          name="periodicidadeMeses"
          label={c('campos.periodicidade')}
          tipo="numero"
          obrigatorio
          descricao={t('pesquisaProfissional.configuracao.ajuda.periodicidade', {
            max: PESQUISA_PROFISSIONAL_PERIODICIDADE_MAX_MESES,
          })}
          disabled={!podeEditar}
        />
        <FormField
          name="mensagem"
          label={c('campos.mensagem')}
          tipo="textarea"
          obrigatorio
          descricao={c('ajuda.mensagem')}
          disabled={!podeEditar}
        />
      </div>
    </FormLayout>
  );
}

/** Aba Configuração: ativação, periodicidade depois dos 30 dias e texto da mensagem (WhatsApp). */
export function AbaConfiguracao() {
  const { t } = useTranslation();
  const { data } = useConfigPesquisaProfissional();
  return (
    <div className="grid max-w-2xl gap-4">
      <p className="text-sm text-muted-foreground">
        {t('pesquisaProfissional.configuracao.descricao')}
      </p>
      {data ? <Formulario config={data} /> : null}
    </div>
  );
}
