import type { CatalogoOrcamentoItem, OrcamentoOrigem } from '@torres/shared';
import { SearchIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/use-debounce';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { cn } from '@/lib/utils';
import { CATALOGO_TAMANHO, useCatalogoOrcamento } from './use-orcamentos';

const ABAS_CATALOGO: readonly { tipo: OrcamentoOrigem; rotulo: string; busca: string }[] = [
  { tipo: 'servico', rotulo: 'Serviços', busca: 'Buscar serviço…' },
  { tipo: 'protocolo', rotulo: 'Protocolos', busca: 'Buscar protocolo…' },
  { tipo: 'protocolo-mae', rotulo: 'Protocolos Mãe', busca: 'Buscar protocolo mãe…' },
];

const ATRASO_BUSCA_MS = 300;

export interface CatalogoItensProps {
  onAdicionar: (origem: OrcamentoOrigem, item: CatalogoOrcamentoItem) => void;
}

/** "Adicionar itens": abas Serviços / Protocolos / Protocolos Mãe, busca e lista com preço. */
export function CatalogoItens({ onAdicionar }: Readonly<CatalogoItensProps>) {
  const [tipo, setTipo] = useState<OrcamentoOrigem>('servico');
  const [busca, setBusca] = useState('');
  const aba = ABAS_CATALOGO.find((a) => a.tipo === tipo) ?? ABAS_CATALOGO[0];
  const catalogo = useCatalogoOrcamento(tipo, useDebounce(busca.trim(), ATRASO_BUSCA_MS));
  const itens = catalogo.data?.data ?? [];

  return (
    <div className="grid gap-2">
      <div role="tablist" aria-label="Tipo de item" className="flex flex-wrap gap-2">
        {ABAS_CATALOGO.map((a) => (
          <Button
            key={a.tipo}
            type="button"
            role="tab"
            size="sm"
            aria-selected={a.tipo === tipo}
            variant={a.tipo === tipo ? 'default' : 'secondary'}
            onClick={() => setTipo(a.tipo)}
          >
            {a.rotulo}
          </Button>
        ))}
      </div>
      <div className="relative">
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          className="pl-9"
          placeholder={aba?.busca}
          aria-label={aba?.busca}
          value={busca}
          onChange={(evento) => setBusca(evento.target.value)}
        />
      </div>
      <ul
        aria-label={aba?.rotulo}
        className="max-h-48 divide-y overflow-y-auto rounded-lg border text-sm"
      >
        {itens.length === 0 && (
          <li className="px-3 py-4 text-center text-muted-foreground">
            {catalogo.isPending ? 'Carregando…' : `Nenhum ${aba?.rotulo.toLowerCase()} encontrado`}
          </li>
        )}
        {itens.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={cn(
                'flex w-full items-center justify-between gap-3 px-3 py-2 text-left',
                'hover:bg-muted focus-visible:bg-muted focus-visible:outline-none',
              )}
              onClick={() => onAdicionar(tipo, item)}
            >
              <span>
                {item.nome}
                {item.detalhe && (
                  <span className="ml-1 text-xs text-muted-foreground uppercase">
                    ({item.detalhe})
                  </span>
                )}
              </span>
              <span className="font-medium whitespace-nowrap text-emerald-700 dark:text-emerald-400">
                {formatarMoeda(item.valor)}
              </span>
            </button>
          </li>
        ))}
        {catalogo.data && catalogo.data.meta.total > CATALOGO_TAMANHO && (
          <li className="px-3 py-2 text-center text-xs text-muted-foreground">
            Mostrando {CATALOGO_TAMANHO} de {catalogo.data.meta.total}. Refine a busca.
          </li>
        )}
      </ul>
    </div>
  );
}
