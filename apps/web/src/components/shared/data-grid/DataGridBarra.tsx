import { DownloadIcon, SearchIcon, Settings2Icon } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EntitySelect } from '@/components/shared/EntitySelect';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
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
  const { t } = useTranslation();
  const opcoes: OpcaoFiltro[] = [
    { valor: '', rotulo: status.rotuloTodos ?? t('comum.todos') },
    ...status.opcoes,
  ];
  return (
    <div
      role="group"
      aria-label={t('grid.filtrarStatus')}
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

/**
 * Filtros extras: selects ("Todos" + opções), períodos "<rótulo> de: … até: … Limpar", combobox
 * de entidade (com busca na API) e checkbox.
 */
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
      {filtros.map((filtro) => {
        switch (filtro.tipo) {
          case 'select':
            return (
              <FiltroSelect
                key={filtro.parametro}
                filtro={filtro}
                valor={valores[filtro.parametro]}
                onChange={onChange}
              />
            );
          case 'periodo':
            return (
              <FiltroPeriodo
                key={filtro.parametroDe}
                filtro={filtro}
                valores={valores}
                onChange={onChange}
              />
            );
          case 'entidade':
            return (
              <EntitySelect
                key={filtro.parametro}
                entidade={filtro.entidade}
                filtros={filtro.filtros}
                value={valores[filtro.parametro] ?? null}
                onChange={(id) => onChange({ [filtro.parametro]: id ?? undefined })}
                placeholder={filtro.rotuloTodos}
                aria-label={filtro.rotulo}
                className="h-8 w-full sm:w-64"
              />
            );
          case 'checkbox':
            return (
              <FiltroCheckbox
                key={filtro.parametro}
                filtro={filtro}
                marcado={valores[filtro.parametro] === 'true'}
                onChange={onChange}
              />
            );
        }
      })}
    </div>
  );
}

function FiltroCheckbox({
  filtro,
  marcado,
  onChange,
}: Readonly<{
  filtro: Extract<FiltroGrid, { tipo: 'checkbox' }>;
  marcado: boolean;
  onChange: Alterar;
}>) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={marcado}
        onCheckedChange={(novo) =>
          onChange({ [filtro.parametro]: novo === true ? 'true' : undefined })
        }
      />
      <Label htmlFor={id}>{filtro.rotulo}</Label>
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
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      {/* Como nos prints, o select mostra só o valor ("Todos"); o rótulo fica para leitores de tela. */}
      <Label htmlFor={id} className="sr-only">
        {filtro.rotulo}
      </Label>
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
          <SelectItem value={TODOS}>{filtro.rotuloTodos ?? t('comum.todos')}</SelectItem>
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
  const { t } = useTranslation();
  const id = useId();
  const { parametroDe, parametroAte } = filtro;
  const extremos = [
    { parametro: parametroDe, rotulo: t('grid.periodoDe', { rotulo: filtro.rotulo }) },
    { parametro: parametroAte, rotulo: t('grid.periodoAte') },
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
        aria-label={t('grid.limparFiltro', { rotulo: filtro.rotulo })}
        onClick={() => onChange({ [parametroDe]: undefined, [parametroAte]: undefined })}
      >
        {t('comum.limpar')}
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
  const { t } = useTranslation();
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
        aria-label={t('grid.buscarRotulo')}
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
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2Icon aria-hidden />
          {t('grid.colunas')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
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
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-busy={exportando}>
          <DownloadIcon aria-hidden />
          {t('grid.exportar')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={exportando} onSelect={() => onExportar('xlsx')}>
          {t('grid.excel')}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={exportando} onSelect={() => onExportar('pdf')}>
          {t('grid.pdf')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
