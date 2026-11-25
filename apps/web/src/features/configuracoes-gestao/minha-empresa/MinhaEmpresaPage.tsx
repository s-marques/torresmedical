import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermissao } from '@/lib/auth/use-sessao';
import { AbaDados } from './AbaDados';
import { AbaExportacaoDados } from './AbaExportacaoDados';
import { AbaHorarios } from './AbaHorarios';
import { AbaIntegracoes } from './AbaIntegracoes';
import { AbaPlanoFaturas } from './AbaPlanoFaturas';
import { AbaSeguranca } from './AbaSeguranca';
import { AbaUnidades } from './AbaUnidades';
import { AbaUsuarios } from './AbaUsuarios';
import { useEmpresa } from './use-minha-empresa';

/**
 * Tela "Minha Empresa" (`/settings/empresa`, docs/inventario/telas/configuracoes-gestao-minha-empresa.md):
 * abas Dados, Plano e Faturas, Integrações, Usuários, Unidades, Horários, Segurança e,
 * com permissão, Exportação de dados (issue #158).
 */
export default function MinhaEmpresaPage() {
  const { t } = useTranslation();
  const [aba, setAba] = useState('dados');
  const [criandoUnidade, setCriandoUnidade] = useState(false);
  const empresa = useEmpresa();
  const veExportacao = usePermissao('configuracoes-gestao.exportacao-lote.ver');

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Configurações da Empresa"
        descricao="Gerencie os dados cadastrais, plano e usuários da sua empresa."
      />
      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="plano-faturas">Plano e Faturas</TabsTrigger>
          <TabsTrigger value="integracoes">Integrações</TabsTrigger>
          <TabsTrigger value="usuarios">Usuários</TabsTrigger>
          <TabsTrigger value="unidades">Unidades</TabsTrigger>
          <TabsTrigger value="horarios">Horários</TabsTrigger>
          <TabsTrigger value="seguranca">{t('seguranca.aba')}</TabsTrigger>
          {veExportacao && <TabsTrigger value="exportacao">{t('exportacaoLote.aba')}</TabsTrigger>}
        </TabsList>
        <TabsContent value="dados">
          {empresa.isError && (
            <p className="text-sm text-destructive" role="alert">
              Não foi possível carregar os dados da empresa.
            </p>
          )}
          {empresa.data && <AbaDados empresa={empresa.data} />}
        </TabsContent>
        <TabsContent value="plano-faturas">
          <AbaPlanoFaturas />
        </TabsContent>
        <TabsContent value="integracoes">
          <AbaIntegracoes />
        </TabsContent>
        <TabsContent value="usuarios">
          <AbaUsuarios />
        </TabsContent>
        <TabsContent value="unidades">
          <AbaUnidades
            criando={criandoUnidade}
            onAbrirCriando={() => setCriandoUnidade(true)}
            onFecharCriando={() => setCriandoUnidade(false)}
          />
        </TabsContent>
        <TabsContent value="horarios">
          <AbaHorarios />
        </TabsContent>
        <TabsContent value="seguranca">
          <AbaSeguranca />
        </TabsContent>
        {veExportacao && (
          <TabsContent value="exportacao">
            <AbaExportacaoDados />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
