import {
  politicaSegurancaInputSchema,
  type PoliticaSeguranca,
  type PoliticaSegurancaInput,
} from '@torres/shared';
import { ShieldCheckIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { usePermissao } from '@/lib/auth/use-sessao';
import { usePoliticaSeguranca, useSalvarPoliticaSeguranca } from './use-politica-seguranca';

function valoresIniciais(politica: PoliticaSeguranca): PoliticaSegurancaInput {
  return {
    tamanhoMinimo: politica.tamanhoMinimo,
    exigirMaiuscula: politica.exigirMaiuscula,
    exigirSimbolo: politica.exigirSimbolo,
    tentativasBloqueio: politica.tentativasBloqueio,
    minutosBloqueio: politica.minutosBloqueio,
    trocaPrimeiroAcesso: politica.trocaPrimeiroAcesso,
    expiracaoDias: politica.expiracaoDias,
    carenciaProfissionalDias: politica.carenciaProfissionalDias,
  };
}

/**
 * Aba "Segurança" (issue #156, R §41): regras de senha, bloqueio por tentativas, troca no
 * primeiro acesso, expiração e carência do acesso do profissional.
 */
export function AbaSeguranca() {
  const { t } = useTranslation();
  const politica = usePoliticaSeguranca();

  if (politica.isError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {t('seguranca.erroCarregar')}
      </p>
    );
  }
  if (!politica.data) return null;
  return <FormularioSeguranca politica={politica.data} />;
}

function FormularioSeguranca({ politica }: Readonly<{ politica: PoliticaSeguranca }>) {
  const { t } = useTranslation();
  const salvar = useSalvarPoliticaSeguranca();
  const podeEditar = usePermissao('configuracoes-gestao.minha-empresa.editar');
  const form = useFormulario(politicaSegurancaInputSchema, {
    defaultValues: valoresIniciais(politica),
  });

  return (
    <div className="grid gap-6 rounded-lg border p-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheckIcon aria-hidden className="size-5" />
          {t('seguranca.titulo')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('seguranca.descricao')}</p>
      </div>
      <FormLayout
        form={form}
        colunas={2}
        rotuloEnviar={t('seguranca.salvar')}
        acoes={podeEditar ? undefined : null}
        onSubmit={(valores) => salvar.mutateAsync(valores)}
      >
        <h3 className="text-sm font-semibold sm:col-span-2">{t('seguranca.secaoSenha')}</h3>
        <FormField
          name="tamanhoMinimo"
          label={t('seguranca.tamanhoMinimo')}
          tipo="numero"
          disabled={!podeEditar}
        />
        <div className="grid content-start gap-3">
          <FormField
            name="exigirMaiuscula"
            label={t('seguranca.exigirMaiuscula')}
            tipo="switch"
            disabled={!podeEditar}
          />
          <FormField
            name="exigirSimbolo"
            label={t('seguranca.exigirSimbolo')}
            tipo="switch"
            disabled={!podeEditar}
          />
          <FormField
            name="trocaPrimeiroAcesso"
            label={t('seguranca.trocaPrimeiroAcesso')}
            descricao={t('seguranca.trocaPrimeiroAcessoAjuda')}
            tipo="switch"
            disabled={!podeEditar}
          />
        </div>
        <FormField
          name="expiracaoDias"
          label={t('seguranca.expiracaoDias')}
          descricao={t('seguranca.expiracaoDiasAjuda')}
          tipo="numero"
          disabled={!podeEditar}
          className="sm:col-span-2"
        />
        <h3 className="text-sm font-semibold sm:col-span-2">{t('seguranca.secaoBloqueio')}</h3>
        <FormField
          name="tentativasBloqueio"
          label={t('seguranca.tentativasBloqueio')}
          tipo="numero"
          disabled={!podeEditar}
        />
        <FormField
          name="minutosBloqueio"
          label={t('seguranca.minutosBloqueio')}
          tipo="numero"
          disabled={!podeEditar}
        />
        <h3 className="text-sm font-semibold sm:col-span-2">{t('seguranca.secaoAcesso')}</h3>
        <FormField
          name="carenciaProfissionalDias"
          label={t('seguranca.carenciaProfissionalDias')}
          descricao={t('seguranca.carenciaProfissionalDiasAjuda')}
          tipo="numero"
          disabled={!podeEditar}
          className="sm:col-span-2"
        />
      </FormLayout>
    </div>
  );
}
