import type { ConversaWhatsappDetalhe } from '@torres/shared';
import { CheckIcon, TagIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useAlterarTagDaConversa, useTags } from './use-whatsapp';

/** Ícone de tag do cabeçalho: aplica ou remove tags (as de "Gerenciar Tags") da conversa. */
export function SeletorTags({ conversa }: Readonly<{ conversa: ConversaWhatsappDetalhe }>) {
  const [aberto, setAberto] = useState(false);
  const tags = useTags(aberto);
  const alterar = useAlterarTagDaConversa(conversa.id);
  const aplicadas = new Set(conversa.tags.map((tag) => tag.id));
  const lista = tags.data?.data ?? [];

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label="Tags da conversa">
          <TagIcon aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        {tags.isPending && (
          <p role="status" className="p-3 text-center text-sm text-muted-foreground">
            Carregando…
          </p>
        )}
        {tags.isSuccess && lista.length === 0 && (
          <p role="status" className="p-3 text-center text-sm text-muted-foreground">
            Nenhuma tag criada.
          </p>
        )}
        <ul aria-label="Tags disponíveis" className="grid gap-1">
          {lista.map((tag) => {
            const aplicada = aplicadas.has(tag.id);
            return (
              <li key={tag.id}>
                <button
                  type="button"
                  aria-pressed={aplicada}
                  disabled={alterar.isPending}
                  onClick={() => alterar.mutate({ tagId: tag.id, aplicar: !aplicada })}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                    aplicada && 'bg-muted font-medium',
                  )}
                >
                  <span
                    aria-hidden
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: tag.cor }}
                  />
                  <span className="flex-1 truncate">{tag.nome}</span>
                  {aplicada && <CheckIcon aria-hidden className="size-4" />}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
