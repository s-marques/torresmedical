import type { PaginationMeta } from '@torres/shared';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  type LucideIcon,
} from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface DataGridPaginacaoProps {
  /** `meta` da última resposta (ausente enquanto carrega a primeira página). */
  meta?: PaginationMeta;
  page: number;
  pageSize: number;
  tamanhos: readonly number[];
  onPagina: (pagina: number) => void;
  onTamanho: (tamanho: number) => void;
}

/**
 * Rodapé do grid, como nos prints: "N linha(s) no total.", "Linhas por página",
 * "Página X de Y" e primeira/anterior/próxima/última (rótulos do inventário).
 */
export function DataGridPaginacao({
  meta,
  page,
  pageSize,
  tamanhos,
  onPagina,
  onTamanho,
}: Readonly<DataGridPaginacaoProps>) {
  const id = useId();
  const { t } = useTranslation();
  const total = meta?.total ?? 0;
  const totalPaginas = meta?.totalPages ?? 0;
  const botoes: { rotulo: string; Icone: LucideIcon; destino: number; desabilitado: boolean }[] = [
    {
      rotulo: t('grid.primeiraPagina'),
      Icone: ChevronsLeftIcon,
      destino: 1,
      desabilitado: page <= 1,
    },
    {
      rotulo: t('grid.paginaAnterior'),
      Icone: ChevronLeftIcon,
      destino: page - 1,
      desabilitado: page <= 1,
    },
    {
      rotulo: t('grid.proximaPagina'),
      Icone: ChevronRightIcon,
      destino: page + 1,
      desabilitado: page >= totalPaginas,
    },
    {
      rotulo: t('grid.ultimaPagina'),
      Icone: ChevronsRightIcon,
      destino: totalPaginas,
      desabilitado: page >= totalPaginas,
    },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-2">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t('grid.totalLinhas', { total })}
      </p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor={id}>{t('grid.linhasPorPagina')}</Label>
          <Select value={String(pageSize)} onValueChange={(valor) => onTamanho(Number(valor))}>
            <SelectTrigger id={id} size="sm" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent side="top">
              {tamanhos.map((tamanho) => (
                <SelectItem key={tamanho} value={String(tamanho)}>
                  {tamanho}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm font-medium">
          {t('grid.paginaDe', { pagina: page, total: totalPaginas })}
        </p>
        <nav aria-label={t('grid.paginacao')} className="flex items-center gap-2">
          {botoes.map(({ rotulo, Icone, destino, desabilitado }) => (
            <Button
              key={rotulo}
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={rotulo}
              title={rotulo}
              // `aria-disabled`: na última página, o botão desabilitado tiraria o foco do teclado.
              aria-disabled={desabilitado}
              className={cn(desabilitado && 'cursor-not-allowed opacity-50')}
              onClick={() => desabilitado || onPagina(destino)}
            >
              <Icone aria-hidden />
            </Button>
          ))}
        </nav>
      </div>
    </div>
  );
}
