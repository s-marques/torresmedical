import { useDraggable } from '@dnd-kit/core';
import type { Estagio, Negocio } from '@torres/shared';
import {
  AlarmClockIcon,
  CalendarClockIcon,
  CheckIcon,
  DollarSignIcon,
  EllipsisIcon,
  PencilIcon,
  Trash2Icon,
  TrophyIcon,
  UserIcon,
  XCircleIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePermissao } from '@/lib/auth/use-sessao';
import { formatarDataHora } from '@/lib/formatar';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { cn } from '@/lib/utils';

/** Ações do menu "⋯" do cartão. */
export interface AcoesCartao {
  onEditar: (negocio: Negocio) => void;
  onMover: (negocio: Negocio, estagioId: string) => void;
  onFollowUp: (negocio: Negocio) => void;
  onConcluirAcao: (atividadeId: string) => void;
  onGanho: (negocio: Negocio) => void;
  onPerdido: (negocio: Negocio) => void;
  onExcluir: (negocio: Negocio) => void;
}

export interface CartaoNegocioProps extends AcoesCartao {
  negocio: Negocio;
  estagios: readonly Estagio[];
}

const DESTAQUE = {
  SEM_ACAO: {
    rotulo: 'Sem próxima ação',
    cartao: 'border-amber-400 bg-amber-50 dark:border-amber-500/70 dark:bg-amber-950/30',
    texto: 'text-amber-700 dark:text-amber-400',
  },
  ATRASADA: {
    rotulo: 'Atrasado',
    cartao: 'border-red-400 bg-red-50 dark:border-red-500/70 dark:bg-red-950/30',
    texto: 'text-red-700 dark:text-red-400',
  },
} as const;

/** Cartão do negócio no quadro: título, valor, contato, responsável e próxima ação. */
export function CartaoNegocio({ negocio, estagios, ...acoes }: Readonly<CartaoNegocioProps>) {
  const podeEditar = usePermissao('comercial-atendimento.pipeline.editar');
  const podeCriar = usePermissao('comercial-atendimento.pipeline.criar');
  const podeExcluir = usePermissao('comercial-atendimento.pipeline.excluir');
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: negocio.id,
    data: { estagioId: negocio.estagioId },
    disabled: !podeEditar,
    // O cartão continua um "article" (tem o botão de menu dentro); o dnd-kit poria role="button".
    attributes: { role: 'article', roleDescription: 'cartão arrastável' },
  });

  const destaque =
    negocio.situacaoAcao === 'SEM_ACAO' || negocio.situacaoAcao === 'ATRASADA'
      ? DESTAQUE[negocio.situacaoAcao]
      : null;
  const proxima = negocio.proximaAtividade;
  const outrosEstagios = estagios.filter((e) => e.id !== negocio.estagioId);

  return (
    <article
      ref={setNodeRef}
      aria-label={negocio.titulo}
      data-situacao={negocio.situacaoAcao ?? undefined}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={cn(
        'grid gap-1 rounded-lg border bg-card p-3 text-sm shadow-xs',
        podeEditar && 'cursor-grab touch-none',
        isDragging && 'relative z-10 opacity-80 shadow-lg',
        destaque?.cartao,
      )}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold leading-snug uppercase">{negocio.titulo}</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="-mt-1 -mr-1 size-7 shrink-0"
              aria-label={`Ações de ${negocio.titulo}`}
              // O clique no menu não começa a arrastar o cartão.
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-96 overflow-y-auto">
            {podeEditar && (
              <DropdownMenuItem onSelect={() => acoes.onEditar(negocio)}>
                <PencilIcon /> Editar
              </DropdownMenuItem>
            )}
            {podeEditar &&
              outrosEstagios.map((e) => (
                <DropdownMenuItem key={e.id} onSelect={() => acoes.onMover(negocio, e.id)}>
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: e.cor }}
                  />
                  Mover → {e.nome}
                </DropdownMenuItem>
              ))}
            {podeCriar && (
              <DropdownMenuItem onSelect={() => acoes.onFollowUp(negocio)}>
                <CalendarClockIcon /> Agendar Follow-up
              </DropdownMenuItem>
            )}
            {podeEditar && proxima && (
              <DropdownMenuItem onSelect={() => acoes.onConcluirAcao(proxima.id)}>
                <CheckIcon /> Concluir próxima ação
              </DropdownMenuItem>
            )}
            {podeEditar && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-emerald-700 dark:text-emerald-400"
                  onSelect={() => acoes.onGanho(negocio)}
                >
                  <TrophyIcon className="text-current" /> Ganho
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-orange-700 dark:text-orange-400"
                  onSelect={() => acoes.onPerdido(negocio)}
                >
                  <XCircleIcon className="text-current" /> Perdido
                </DropdownMenuItem>
              </>
            )}
            {podeExcluir && (
              <DropdownMenuItem variant="destructive" onSelect={() => acoes.onExcluir(negocio)}>
                <Trash2Icon /> Excluir
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p className="flex items-center gap-1.5 font-medium">
        <DollarSignIcon className="size-3.5 text-muted-foreground" aria-hidden />
        {negocio.valor === null ? '-' : formatarMoeda(Number(negocio.valor))}
      </p>
      <p className="flex items-center gap-1.5 text-muted-foreground">
        <UserIcon className="size-3.5" aria-hidden />
        <span className="truncate">{negocio.contato ?? '-'}</span>
      </p>
      {negocio.responsavel && (
        <p className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
          <UserIcon className="size-3.5" aria-hidden />
          <span className="truncate">{negocio.responsavel}</span>
        </p>
      )}
      {proxima && (
        <p
          className={cn(
            'flex items-center gap-1.5 text-xs',
            destaque ? destaque.texto : 'text-muted-foreground',
          )}
        >
          <AlarmClockIcon className="size-3.5" aria-hidden />
          <span className="truncate">
            {proxima.titulo} · {formatarDataHora(proxima.dataHora)}
          </span>
        </p>
      )}
      {destaque && <p className={cn('text-xs font-semibold', destaque.texto)}>{destaque.rotulo}</p>}
    </article>
  );
}
