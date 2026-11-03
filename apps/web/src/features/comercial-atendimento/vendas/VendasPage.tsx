import { CalendarCheckIcon, ShoppingCartIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ConsultasRealizadas } from './ConsultasRealizadas';
import { ModalPdv } from './ModalPdv';
import { VendasPdv } from './VendasPdv';

const ABAS = [
  { id: 'consultas', rotulo: 'Consultas Realizadas', icone: CalendarCheckIcon },
  { id: 'vendas', rotulo: 'Vendas (PDV)', icone: ShoppingCartIcon },
] as const;
type AbaId = (typeof ABAS)[number]['id'];

const PARAMETRO_ABA = 'aba';

function dataIso(data: Date): string {
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}`;
}

/** Primeiro e último dia do mês atual, o período que a tela abre no inventário. */
function mesAtual(): { de: string; ate: string } {
  const hoje = new Date();
  return {
    de: dataIso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
    ate: dataIso(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)),
  };
}

/**
 * Vendas/PDV (`/vendas`, docs/inventario/telas/comercial-atendimento-vendas-pdv.md): abas
 * Consultas Realizadas e Vendas (PDV). Receber e NFSe (por linha, em Consultas Realizadas)
 * aguardam a definição da QA: veja o comentário no card #15.
 */
export default function VendasPage() {
  const [params, setParams] = useSearchParams();
  const aba: AbaId = params.get(PARAMETRO_ABA) === 'vendas' ? 'vendas' : 'consultas';
  const [novaVenda, setNovaVenda] = useState(false);
  const semPeriodo = aba === 'consultas' && !params.has('de') && !params.has('ate');

  // A tela abre no mês atual (De/Até preenchidos); "Limpar" no filtro de período mostra tudo.
  const periodoInicialAplicado = useRef(false);
  useEffect(() => {
    if (!semPeriodo || periodoInicialAplicado.current) return;
    periodoInicialAplicado.current = true;
    setParams(
      (atuais) => {
        const { de, ate } = mesAtual();
        const proximos = new URLSearchParams(atuais);
        proximos.set('de', de);
        proximos.set('ate', ate);
        return proximos;
      },
      { replace: true },
    );
  }, [semPeriodo, setParams]);

  function trocarAba(proxima: AbaId) {
    if (proxima === aba) return;
    // Cada aba tem o próprio grid: o estado do outro (página, filtros) não vale aqui.
    periodoInicialAplicado.current = false;
    setParams(proxima === 'consultas' ? {} : { [PARAMETRO_ABA]: proxima }, { replace: true });
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Vendas / Consultas"
        descricao="Vendas, consultas realizadas e faturamento."
        breadcrumb={[{ rotulo: 'Painel', para: '/' }, { rotulo: 'Vendas' }]}
        acoes={
          aba === 'vendas' && (
            <SePermitido permissao="comercial-atendimento.vendas-pdv.criar">
              <Button type="button" onClick={() => setNovaVenda(true)}>
                <ShoppingCartIcon aria-hidden />
                Nova Venda (PDV)
              </Button>
            </SePermitido>
          )
        }
      />
      <div
        role="tablist"
        aria-label="Seções de Vendas / Consultas"
        className="flex w-fit flex-wrap gap-1 rounded-lg bg-muted p-1"
      >
        {ABAS.map(({ id, rotulo, icone: Icone }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`aba-${id}`}
            aria-selected={aba === id}
            aria-controls="painel-aba"
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              aba === id
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => trocarAba(id)}
          >
            <Icone aria-hidden className="size-4" />
            {rotulo}
          </button>
        ))}
      </div>
      <div id="painel-aba" role="tabpanel" aria-labelledby={`aba-${aba}`}>
        {aba === 'consultas' ? <ConsultasRealizadas /> : <VendasPdv />}
      </div>
      {novaVenda && <ModalPdv onFechar={() => setNovaVenda(false)} />}
    </div>
  );
}
