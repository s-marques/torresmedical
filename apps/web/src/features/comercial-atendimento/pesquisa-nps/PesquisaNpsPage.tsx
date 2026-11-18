import { SendIcon } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AbaDashboard } from './AbaDashboard';
import { AbaRespostas } from './AbaRespostas';
import { periodoPadrao } from './periodo';
import { useRecarregarPesquisaNps } from './use-pesquisa-nps';

/**
 * Pesquisa NPS (`/pesquisa-satisfacao`, docs/inventario/telas/comercial-atendimento-pesquisa-nps.md).
 * O período aplicado ("Carregar") é um só e vale para o Dashboard e para as Respostas: o NPS de um
 * mês nunca abre as respostas de outro (falha C3 do legado).
 */
export default function PesquisaNpsPage() {
  const [rascunho, setRascunho] = useState(periodoPadrao);
  const [periodo, setPeriodo] = useState(rascunho);
  const [aba, setAba] = useState('dashboard');
  const recarregar = useRecarregarPesquisaNps();

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Pesquisa de Satisfacao"
        descricao="NPS - Avalie a satisfacao dos seus pacientes apos o atendimento."
      />
      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="respostas">Respostas</TabsTrigger>
          <TabsTrigger value="configuracao">Configuracao</TabsTrigger>
        </TabsList>
        {/* Sem filtro na Configuração (print do legado). */}
        <form
          hidden={aba === 'configuracao'}
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            // Mesmo período: só recarrega os dados.
            if (rascunho.de === periodo.de && rascunho.ate === periodo.ate) void recarregar();
            else setPeriodo(rascunho);
          }}
        >
          <div className="grid gap-1">
            <Label htmlFor="nps-de">De</Label>
            <Input
              id="nps-de"
              type="date"
              className="w-44"
              value={rascunho.de}
              onChange={(e) => setRascunho((r) => ({ ...r, de: e.target.value }))}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="nps-ate">Ate</Label>
            <Input
              id="nps-ate"
              type="date"
              className="w-44"
              value={rascunho.ate}
              onChange={(e) => setRascunho((r) => ({ ...r, ate: e.target.value }))}
            />
          </div>
          <Button type="submit" disabled={!rascunho.de || !rascunho.ate}>
            <SendIcon aria-hidden />
            Carregar
          </Button>
        </form>
        <TabsContent value="dashboard" className="mt-4">
          <AbaDashboard {...periodo} />
        </TabsContent>
        <TabsContent value="respostas" className="mt-4">
          <AbaRespostas {...periodo} />
        </TabsContent>
        <TabsContent value="configuracao" className="mt-4">
          <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
            A configuração da pesquisa (mensagem, atraso do envio e ativação) será disponibilizada
            depois da definição das regras com a clínica.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
