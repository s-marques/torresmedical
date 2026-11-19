import { ShieldIcon } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AbaAlertas } from './AbaAlertas';
import { AbaExtras } from './AbaExtras';
import { AbaInstrucoes } from './AbaInstrucoes';
import { AbaRegras } from './AbaRegras';

const BREADCRUMB = [
  { rotulo: 'Painel', para: '/' },
  { rotulo: 'Agentes IA', para: '/agentes-ia' },
  { rotulo: 'Instruções' },
];

/**
 * Instruções Agente (`/agentes-ia/instrucoes`,
 * docs/inventario/telas/configuracoes-gestao-instrucoes-agente.md): instruções (system prompt),
 * instruções extras, destinos de alerta e regras do agente de IA.
 */
export default function InstrucoesAgentePage() {
  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Instruções do Agente IA"
        descricao="Configure as instruções e ferramentas do agente de atendimento."
        breadcrumb={BREADCRUMB}
      />
      <Tabs defaultValue="instrucoes" className="gap-6">
        <TabsList>
          <TabsTrigger value="instrucoes">Instruções</TabsTrigger>
          <TabsTrigger value="extras">Instruções Extras</TabsTrigger>
          <TabsTrigger value="alertas">Alertas do Agente</TabsTrigger>
          <TabsTrigger value="regras">
            <ShieldIcon aria-hidden />
            Regras
          </TabsTrigger>
        </TabsList>
        <TabsContent value="instrucoes">
          <AbaInstrucoes />
        </TabsContent>
        <TabsContent value="extras">
          <AbaExtras />
        </TabsContent>
        <TabsContent value="alertas">
          <AbaAlertas />
        </TabsContent>
        <TabsContent value="regras">
          <AbaRegras />
        </TabsContent>
      </Tabs>
    </div>
  );
}
