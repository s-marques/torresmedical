import { useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AbaBancaria } from './AbaBancaria';
import { AbaContasBancarias } from './AbaContasBancarias';

type Aba = 'bancaria' | 'contas-bancarias';

/**
 * Conciliação (`/conciliacao`, docs/inventario/telas/financeiro-conciliacao.md), parte 1 da #46:
 * abas "Bancaria" (Saldo Sistema e Lançamentos do Sistema) e "Contas Bancárias". A importação do
 * extrato e a conciliação chegam na parte 2; a aba "Cartao", na parte 3.
 */
export default function ConciliacaoPage() {
  const [aba, setAba] = useState<Aba>('bancaria');

  return (
    <div className="grid gap-6">
      <PageHeader titulo="Conciliação" descricao="Conciliação bancária e de cartão de crédito." />
      <Tabs value={aba} onValueChange={(valor) => setAba(valor as Aba)} className="gap-4">
        <TabsList>
          <TabsTrigger value="bancaria">Bancária</TabsTrigger>
          <TabsTrigger value="contas-bancarias">Contas Bancárias</TabsTrigger>
        </TabsList>
        <TabsContent value="bancaria">
          <AbaBancaria />
        </TabsContent>
        <TabsContent value="contas-bancarias">
          <AbaContasBancarias />
        </TabsContent>
      </Tabs>
    </div>
  );
}
