import { somarItensPacote, type PacoteFormulario } from '@torres/shared';
import { SearchIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDebounce } from '@/hooks/use-debounce';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { cn } from '@/lib/utils';
import { useCatalogoPacote } from './use-pacotes';

const ATRASO_BUSCA_MS = 300;

/** Nome e preço do produto, só para exibir: o formulário envia apenas produto e quantidade. */
export interface InfoItemPacote {
  nome: string;
  valor: number;
}

export interface ItensPacoteProps {
  /** Itens que o pacote já tem (edição). */
  iniciais?: Readonly<Record<string, InfoItemPacote>>;
}

/** "Itens / Procedimentos": busca de produto, lista dos escolhidos com a quantidade de sessões. */
export function ItensPacote({ iniciais = {} }: Readonly<ItensPacoteProps>) {
  const { control, getValues, formState } = useFormContext<PacoteFormulario>();
  const { fields, append, update, remove } = useFieldArray({ control, name: 'itens' });
  const itens = useWatch({ control, name: 'itens' }) ?? [];
  const [info, setInfo] = useState<Record<string, InfoItemPacote>>(iniciais);
  const [busca, setBusca] = useState('');
  const termo = useDebounce(busca.trim(), ATRASO_BUSCA_MS);
  const catalogo = useCatalogoPacote(termo);
  const sugestoes = busca.trim() === '' ? [] : (catalogo.data?.data ?? []);
  const erro = formState.errors.itens?.message ?? formState.errors.itens?.root?.message;

  function adicionar(produto: { id: string; nome: string; valor: number }) {
    setInfo((atual) => ({ ...atual, [produto.id]: { nome: produto.nome, valor: produto.valor } }));
    const indice = getValues('itens').findIndex((i) => i.produtoId === produto.id);
    // O mesmo item de novo só soma a quantidade.
    if (indice >= 0) {
      const atual = getValues(`itens.${indice}`);
      update(indice, { ...atual, quantidade: (Number(atual.quantidade) || 0) + 1 });
    } else {
      append({ produtoId: produto.id, quantidade: 1 });
    }
    setBusca('');
  }

  const soma = somarItensPacote(
    itens.map((i) => ({
      quantidade: Number(i.quantidade) || 0,
      valorUnitario: info[i.produtoId]?.valor ?? 0,
    })),
  );

  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 flex gap-1 text-sm leading-none font-medium">
        Itens / Procedimentos
        <span aria-hidden className="text-sm leading-none text-destructive">
          *
        </span>
      </legend>
      <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
        <div className="relative">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            className="pl-9"
            placeholder="Buscar produto/procedimento..."
            aria-label="Buscar produto/procedimento"
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
          />
          {busca.trim() !== '' && (
            <ul
              aria-label="Produtos e procedimentos"
              className="absolute z-10 mt-1 max-h-48 w-full divide-y overflow-y-auto rounded-lg border bg-popover text-sm shadow-md"
            >
              {sugestoes.length === 0 && (
                <li className="px-3 py-3 text-center text-muted-foreground">
                  {catalogo.isPending || termo !== busca.trim()
                    ? 'Carregando…'
                    : 'Nenhum produto encontrado'}
                </li>
              )}
              {sugestoes.map((produto) => (
                <li key={produto.id}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left',
                      'hover:bg-muted focus-visible:bg-muted focus-visible:outline-none',
                    )}
                    onClick={() => adicionar(produto)}
                  >
                    <span className="font-medium">{produto.nome}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatarMoeda(produto.valor)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {fields.length === 0 && (
          <p className="py-2 text-center text-xs text-muted-foreground">
            Nenhum item adicionado. Busque um produto acima.
          </p>
        )}
        {fields.map((campo, indice) => {
          const item = info[campo.produtoId];
          return (
            <div
              key={campo.id}
              className="flex items-center gap-2 rounded-md border bg-background p-2"
            >
              <div className="min-w-0 flex-1 text-sm">
                <span className="font-medium">{item?.nome ?? 'Item'}</span>{' '}
                <span className="text-xs text-muted-foreground">
                  {formatarMoeda(item?.valor ?? 0)}
                </span>
              </div>
              <Label htmlFor={`quantidade-item-${indice}`} className="text-xs font-normal">
                Sessões
              </Label>
              <Input
                id={`quantidade-item-${indice}`}
                type="number"
                min={1}
                step={1}
                className="w-20 text-center"
                aria-label={`Quantidade do item ${indice + 1}`}
                aria-invalid={Boolean(formState.errors.itens?.[indice]?.quantidade)}
                title={formState.errors.itens?.[indice]?.quantidade?.message}
                value={itens[indice]?.quantidade ?? ''}
                onChange={(evento) =>
                  update(indice, {
                    produtoId: campo.produtoId,
                    quantidade:
                      evento.target.value === '' ? Number.NaN : Number(evento.target.value),
                  })
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-destructive hover:text-destructive"
                aria-label={`Remover item ${indice + 1}`}
                onClick={() => remove(indice)}
              >
                <Trash2Icon aria-hidden />
              </Button>
            </div>
          );
        })}
        {fields.length > 0 && (
          <p className="text-right text-xs text-muted-foreground">
            Soma dos itens: <strong>{formatarMoeda(soma)}</strong>
          </p>
        )}
      </div>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </fieldset>
  );
}
