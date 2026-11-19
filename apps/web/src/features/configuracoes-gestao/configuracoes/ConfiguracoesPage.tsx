import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSessao } from '@/lib/auth/use-sessao';
import { nomeTela } from '@/lib/i18n';
import { AbaAparencia } from './AbaAparencia';
import { AbaPerfil } from './AbaPerfil';
import { AbaPreferencias } from './AbaPreferencias';
import { useMeuPerfil } from './use-configuracoes';

/**
 * Tela "Configurações" (`/settings`, docs/inventario/telas/configuracoes-gestao-configuracoes.md,
 * issue #30): abas Perfil, Preferências e Aparência do usuário logado. As preferências vêm da
 * sessão, que já as traz e é atualizada a cada mudança.
 */
export default function ConfiguracoesPage() {
  const { t } = useTranslation();
  const [aba, setAba] = useState('perfil');
  const perfil = useMeuPerfil();
  const sessao = useSessao();
  const preferencias = sessao.status === 'autenticado' ? sessao.usuario.preferencias : null;

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo={t('configuracoes.titulo')}
        descricao={t('configuracoes.descricao')}
        breadcrumb={[
          { rotulo: nomeTela(t, { id: 'painel.painel', nome: 'Painel' }), para: '/' },
          { rotulo: t('configuracoes.titulo') },
        ]}
      />
      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="perfil">{t('configuracoes.abas.perfil')}</TabsTrigger>
          <TabsTrigger value="preferencias">{t('configuracoes.abas.preferencias')}</TabsTrigger>
          <TabsTrigger value="aparencia">{t('configuracoes.abas.aparencia')}</TabsTrigger>
        </TabsList>
        <TabsContent value="perfil">
          {perfil.isError && (
            <p className="text-sm text-destructive" role="alert">
              {t('configuracoes.perfil.erroCarregar')}
            </p>
          )}
          {perfil.data && <AbaPerfil perfil={perfil.data} />}
        </TabsContent>
        <TabsContent value="preferencias">
          {preferencias && <AbaPreferencias preferencias={preferencias} />}
        </TabsContent>
        <TabsContent value="aparencia">
          {preferencias && <AbaAparencia preferencias={preferencias} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
