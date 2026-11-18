import {
  CheckIcon,
  ClockIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AbaHistorico } from './AbaHistorico';
import { AbaModelosConfig } from './AbaModelosConfig';
import { AbaPendentes } from './AbaPendentes';
import { hojeIso } from './formatar';
import { useRecarregarConfirmacoes, useResumoConfirmacoes } from './use-confirmacoes';

function Cartao({
  rotulo,
  valor,
  icone: Icone,
  cor,
}: Readonly<{ rotulo: string; valor: number; icone: LucideIcon; cor: string }>) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className={`flex items-center gap-2 text-sm font-medium ${cor}`}>
        <Icone aria-hidden className="size-4" />
        {rotulo}
      </p>
      <p className="mt-1 text-2xl font-semibold">{valor}</p>
    </div>
  );
}

/**
 * Confirmações (`/confirmacoes`, docs/inventario/telas/comercial-atendimento-confirmacoes.md):
 * acompanha as confirmações de agenda enviadas pelo WhatsApp e a resposta dos pacientes.
 */
export default function ConfirmacoesPage() {
  const [dataEnvio, setDataEnvio] = useState(hojeIso);
  const resumo = useResumoConfirmacoes(dataEnvio).data;
  const recarregar = useRecarregarConfirmacoes();
  const [recarregando, setRecarregando] = useState(false);

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Confirmacoes de Agenda"
        descricao="Acompanhe e gerencie as confirmacoes automaticas de agendamentos via WhatsApp."
        acoes={
          <Button
            type="button"
            variant="outline"
            disabled={recarregando}
            onClick={async () => {
              setRecarregando(true);
              try {
                await recarregar();
              } finally {
                setRecarregando(false);
              }
            }}
          >
            <RefreshCwIcon aria-hidden />
            Atualizar
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="data-envio">Data de envio:</Label>
        <Input
          id="data-envio"
          type="date"
          className="w-44"
          value={dataEnvio}
          onChange={(e) => setDataEnvio(e.target.value)}
        />
        <Button type="button" variant="ghost" size="sm" onClick={() => setDataEnvio(hojeIso())}>
          Hoje
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="resumo-confirmacoes">
        <Cartao rotulo="Pendentes" valor={resumo?.pendentes ?? 0} icone={ClockIcon} cor="" />
        <Cartao
          rotulo="MSG1 Enviada"
          valor={resumo?.msg1 ?? 0}
          icone={MessageSquareIcon}
          cor="text-blue-600"
        />
        <Cartao
          rotulo="MSG2 Enviada"
          valor={resumo?.msg2 ?? 0}
          icone={MessageSquareIcon}
          cor="text-amber-600"
        />
        <Cartao
          rotulo="MSG3 Enviada"
          valor={resumo?.msg3 ?? 0}
          icone={CheckIcon}
          cor="text-red-600"
        />
      </div>
      <Tabs defaultValue="pendentes">
        <TabsList>
          <TabsTrigger value="pendentes">Pendentes</TabsTrigger>
          <TabsTrigger value="historico">Historico</TabsTrigger>
          <TabsTrigger value="modelos">Modelos e Config</TabsTrigger>
        </TabsList>
        <TabsContent value="pendentes">
          <AbaPendentes dataEnvio={dataEnvio} />
        </TabsContent>
        <TabsContent value="historico">
          <AbaHistorico />
        </TabsContent>
        <TabsContent value="modelos">
          <AbaModelosConfig />
        </TabsContent>
      </Tabs>
    </div>
  );
}
