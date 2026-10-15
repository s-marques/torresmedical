import { DownloadIcon, SearchIcon, Settings2Icon } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { BUSCA_DEBOUNCE_MS } from './estado-grid';
import type { FiltroGrid, FiltroStatus, OpcaoFiltro } from './tipos';

type Alterar = (mudancas: Readonly<Record<string, string | undefined>>) => void;

const TODOS = '__todos__';

/** Chips de status (Todos/Ativo/Inativo…), como nos prints do inventário. */
export function ChipsStatus({
  status,
  valor,
  onChange,
}: Readonly<{ status: FiltroStatus; valor?: string; onChange: (valor?: string) => void }>) {
  const opcoes: OpcaoFiltro[] = [{ valor: '', rotulo: 'Todos' }, ...status.opcoes];
  return (
    <div
      role="group"
      aria-label="Filtrar por status"
      className="inline-flex w-fit flex-wrap gap-1 rounded-lg bg-muted p-1"
    >
      {opcoes.map((opcao) => {
        const ativo = (valor ?? '') === opcao.valor;
        return (
          <Button
            key={opcao.valor || TODOS}
            type="button"
            size="sm"
            variant="ghost"
            aria-pressed={ativo}
            className={cn(
              'h-7 text-muted-foreground',
              ativo && 'bg-background text-foreground shadow-xs hover:bg-background',
            )}
            onClick={() => onChange(opcao.valor || undefined)}
          >
            {opcao.rotulo}
          </Button>
        );
      })}
    </div>
  );
}

/** Filtros extras: selects e períodos De/Até. */
export function FiltrosExtras({
  filtros,
  valores,
  onChange,
}: Readonly<{
  filtros: readonly FiltroGrid[];
  valores: Record<string, string>;
  onChange: Alterar;
}>) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {filtros.map((filtro) =>
        filtro.tipo === 'select' ? (
          <FiltroSelect
            key={filtro.parametro}
            filtro={filtro}
            valor={valores[filtro.parametro]}
            onChange={onChange}
          />
        ) : (
          <FiltroPeriodo
            key={filtro.parametroDe}
            filtro={filtro}
            valores={valores}
            onChange={onChange}
          />
        ),
      )}
    </div>
  );
}

function FiltroSelect({
  filtro,
  valor,
  onChange,
}: Readonly<{
  filtro: Extract<FiltroGrid, { tipo: 'select' }>;
  valor?: string;
  onChange: Alterar;
}>) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id}>{filtro.rotulo}:</Label>
      <Select
        value={valor ?? TODOS}
        onValueChange={(novo) =>
          onChange({ [filtro.parametro]: novo === TODOS ? undefined : novo })
        }
      >
        <SelectTrigger id={id} size="sm" className="min-w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>Todos</SelectItem>
          {filtro.opcoes.map((opcao) => (
            <SelectItem key={opcao.valor} value={opcao.valor}>
              {opcao.rotulo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function FiltroPeriodo({
  filtro,
  valores,
  onChange,
}: Readonly<{
  filtro: Extract<FiltroGrid, { tipo: 'periodo' }>;
  valores: Record<string, string>;
  onChange: Alterar;
}>) {
  const id = useId();
  const { parametroDe, parametroAte } = filtro;
  const extremos = [
    { parametro: parametroDe, rotulo: `${filtro.rotulo} de:` },
    { parametro: parametroAte, rotulo: 'até:' },
  ];
  return (
    <div role="group" aria-label={filtro.rotulo} className="flex flex-wrap items-center gap-2">
      {extremos.map(({ parametro, rotulo }) => (
        <div key={parametro} className="flex items-center gap-2">
          <Label htmlFor={`${id}-${parametro}`}>{rotulo}</Label>
          <Input
            id={`${id}-${parametro}`}
            type="date"
            className="h-8 w-auto"
            value={valores[parametro] ?? ''}
            onChange={(evento) => onChange({ [parametro]: evento.target.value || undefined })}
          />
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`Limpar ${filtro.rotulo}`}
        onClick={() => onChange({ [parametroDe]: undefined, [parametroAte]: undefined })}
      >
        Limpar
      </Button>
    </div>
  );
}

/** Busca textual com atraso: só altera a URL depois de `BUSCA_DEBOUNCE_MS` sem digitar. */
export function CampoBusca({
  valor,
  placeholder,
  onChange,
}: Readonly<{ valor?: string; placeholder: string; onChange: (valor?: string) => void }>) {
  const [texto, setTexto] = useState(valor ?? '');
  const [anterior, setAnterior] = useState(valor);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  // A URL mudou por fora (ex.: "voltar" do navegador): acompanha, sem apagar o espaço que se digita.
  if (valor !== anterior) {
    setAnterior(valor);
    if ((valor ?? '') !== texto.trim()) setTexto(valor ?? '');
  }

  return (
    <div className="relative w-full sm:max-w-sm">
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        aria-label="Buscar"
        placeholder={placeholder}
        className="pl-8"
        value={texto}
        onChange={(evento) => {
          const novo = evento.target.value;
          setTexto(novo);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => onChange(novo.trim() || undefined), BUSCA_DEBOUNCE_MS);
        }}
      />
    </div>
  );
}

export interface ColunaOcultavel {
  id: string;
  titulo: string;
  visivel: boolean;
  alternar: (visivel: boolean) => void;
}

/** Botão "Colunas": mostra e oculta colunas (o menu fica aberto entre as escolhas). */
export function MenuColunas({ colunas }: Readonly<{ colunas: readonly ColunaOcultavel[] }>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2Icon aria-hidden />
          Colunas
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Colunas visíveis</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {colunas.map((coluna) => (
          <DropdownMenuCheckboxItem
            key={coluna.id}
            checked={coluna.visivel}
            onCheckedChange={(marcado) => coluna.alternar(marcado === true)}
            onSelect={(evento) => evento.preventDefault()}
          >
            {coluna.titulo}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Botão "Exportar" com Excel e PDF. */
export function MenuExportar({
  exportando,
  onExportar,
}: Readonly<{ exportando: boolean; onExportar: (formato: 'xlsx' | 'pdf') => void }>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-busy={exportando}>
          <DownloadIcon aria-hidden />
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={exportando} onSelect={() => onExportar('xlsx')}>
          Excel
        </DropdownMenuItem>
        <DropdownMenuItem disabled={exportando} onSelect={() => onExportar('pdf')}>
          PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
