import { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AbaDados } from './AbaDados';
import { AbaHorarios } from './AbaHorarios';
import { AbaIntegracoes } from './AbaIntegracoes';
import { AbaPlanoFaturas } from './AbaPlanoFaturas';
import { AbaUnidades } from './AbaUnidades';
import { AbaUsuarios } from './AbaUsuarios';
import { useEmpresa } from './use-minha-empresa';

/**
 * Tela "Minha Empresa" (`/settings/empresa`, docs/inventario/telas/configuracoes-gestao-minha-empresa.md):
 * seis abas (Dados, Plano e Faturas, Integrações, Usuários, Unidades, Horários).
 */
export default function MinhaEmpresaPage() {
  const [aba, setAba] = useState('dados');
  const [criandoUnidade, setCriandoUnidade] = useState(false);
  const empresa = useEmpresa();

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
      </Tabs>
    </div>
  );
}
