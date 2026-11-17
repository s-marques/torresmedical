import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AbaEnviosAgendados } from './AbaEnviosAgendados';
import { AbaMensagensAutomaticas } from './AbaMensagensAutomaticas';
import { AbaRelatorios } from './AbaRelatorios';

/**
 * Campanhas (`/campanhas`, docs/inventario/telas/comercial-atendimento-campanhas.md): envios
 * agendados em massa e mensagens automáticas pelo WhatsApp, com os relatórios de envio.
 */
export default function CampanhasPage() {
  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Campanhas"
        descricao="Envios agendados em massa e mensagens automáticas."
      />
      <Tabs defaultValue="envios">
        <TabsList>
          <TabsTrigger value="envios">Envios Agendados</TabsTrigger>
          <TabsTrigger value="automaticas">Mensagens Automáticas</TabsTrigger>
          <TabsTrigger value="relatorios">Relatórios</TabsTrigger>
        </TabsList>
        <TabsContent value="envios">
          <AbaEnviosAgendados />
        </TabsContent>
        <TabsContent value="automaticas">
          <AbaMensagensAutomaticas />
        </TabsContent>
        <TabsContent value="relatorios">
          <AbaRelatorios />
        </TabsContent>
      </Tabs>
    </div>
  );
}
