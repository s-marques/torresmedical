import type { Protocolo } from '@torres/shared';
import { ClipboardListIcon, PlusIcon, SearchIcon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { EntitySelect } from '@/components/shared/EntitySelect';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebounce } from '@/hooks/use-debounce';
import { cn } from '@/lib/utils';
import { CardProtocolo } from './CardProtocolo';
import { ModalProtocolo } from './ModalProtocolo';
import { ProtocolosMaeAba } from './ProtocolosMaeAba';
import {
  useCategoriasProtocolo,
  useDuplicarProtocolo,
  useExcluirProtocolo,
  useProtocolos,
} from './use-protocolos';

const BREADCRUMB = [
  { rotulo: 'Painel', para: '/' },
  { rotulo: 'Gestão Profissionais' },
  { rotulo: 'Protocolos' },
];

const DEBOUNCE_BUSCA_MS = 300;
const TODAS = '__todas__';

const ABAS = [
  { id: 'protocolos', rotulo: 'Protocolos', novo: 'Novo Protocolo' },
  { id: 'mae', rotulo: 'Protocolos Mãe', novo: 'Novo Protocolo Mãe' },
  { id: 'receitas', rotulo: 'Receitas', novo: 'Nova Receita' },
  { id: 'exames', rotulo: 'Solic. Exames', novo: 'Nova Solicitação' },
] as const;

type AbaId = (typeof ABAS)[number]['id'];

function agruparPorCategoria(protocolos: readonly Protocolo[]) {
  const grupos = new Map<string, Protocolo[]>();
  for (const protocolo of protocolos) {
    grupos.set(protocolo.categoria, [...(grupos.get(protocolo.categoria) ?? []), protocolo]);
  }
  return [...grupos.entries()];
}

interface FiltrosProps {
  busca: string;
  onBusca: (valor: string) => void;
  categoria: string | null;
  onCategoria: (valor: string | null) => void;
  profissionalId: string | null;
  onProfissional: (valor: string | null) => void;
}

function Filtros({
  busca,
  onBusca,
  categoria,
  onCategoria,
  profissionalId,
  onProfissional,
}: Readonly<FiltrosProps>) {
  const categorias = useCategoriasProtocolo();
  return (
    <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4">
      <div className="grid gap-1.5">
        <Label htmlFor="busca-protocolo">Buscar</Label>
        <div className="relative">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="busca-protocolo"
            className="w-56 pl-8"
            placeholder="Nome…"
            value={busca}
            onChange={(evento) => onBusca(evento.target.value)}
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label id="rotulo-categoria-protocolo">Categoria</Label>
        <Select
          value={categoria ?? TODAS}
          onValueChange={(valor) => onCategoria(valor === TODAS ? null : valor)}
        >
          <SelectTrigger className="w-40" aria-labelledby="rotulo-categoria-protocolo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas</SelectItem>
            {categorias.data?.data.map((nome) => (
              <SelectItem key={nome} value={nome}>
                {nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label id="rotulo-profissional-protocolo">Profissional</Label>
        <EntitySelect
          entidade="profissionais"
          value={profissionalId}
          onChange={onProfissional}
          placeholder="Todos"
          aria-labelledby="rotulo-profissional-protocolo"
          className="w-64"
        />
      </div>
    </div>
  );
}

interface AbaProtocolosProps {
  search: string;
  categoria: string | null;
  profissionalId: string | null;
  pagina: number;
  onPagina: (pagina: number) => void;
}

function AbaProtocolos({
  search,
  categoria,
  profissionalId,
  pagina,
  onPagina,
}: Readonly<AbaProtocolosProps>) {
  const [editando, setEditando] = useState<Protocolo | null>(null);
  const [excluindo, setExcluindo] = useState<Protocolo | null>(null);
  const protocolos = useProtocolos({ search, categoria, profissionalId, page: pagina });
  const duplicar = useDuplicarProtocolo();
  const excluir = useExcluirProtocolo();
  const dados = protocolos.data;

  return (
    <>
      {protocolos.isPending && (
        <div className="grid gap-3" aria-busy>
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-16 rounded-xl" />
          ))}
        </div>
      )}
      {protocolos.isError && (
        <EmptyState
          titulo="Não foi possível carregar os protocolos."
          acao={
            <Button type="button" variant="outline" onClick={() => void protocolos.refetch()}>
              Tentar de novo
            </Button>
          }
        />
      )}
      {dados && dados.data.length === 0 && (
        <div className="rounded-xl border bg-card">
          <EmptyState
            icone={ClipboardListIcon}
            titulo="Nenhum protocolo cadastrado"
            descricao="Crie protocolos com itens de produtos/serviços"
          />
        </div>
      )}
      {dados &&
        agruparPorCategoria(dados.data).map(([categoria, grupo]) => (
          <section key={categoria} className="grid gap-2 rounded-xl border bg-card p-4">
            <h2 className="font-semibold">
              {categoria}{' '}
              <span className="text-sm font-normal text-muted-foreground">({grupo.length})</span>
            </h2>
            <ul className="grid gap-2">
              {grupo.map((protocolo) => (
                <CardProtocolo
                  key={protocolo.id}
                  protocolo={protocolo}
                  onEditar={() => setEditando(protocolo)}
                  onDuplicar={() => void duplicar.mutateAsync(protocolo.id)}
                  onExcluir={() => setExcluindo(protocolo)}
                />
              ))}
            </ul>
          </section>
        ))}
      {dados && dados.meta.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pagina <= 1}
            onClick={() => onPagina(pagina - 1)}
          >
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {pagina} de {dados.meta.totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={pagina >= dados.meta.totalPages}
            onClick={() => onPagina(pagina + 1)}
          >
            Próxima
          </Button>
        </div>
      )}
      {editando && <ModalProtocolo protocolo={editando} onFechar={() => setEditando(null)} />}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir protocolo?"
        descricao={`O protocolo "${excluindo?.nome ?? ''}" será excluído. Esta ação não pode ser desfeita.`}
        rotuloConfirmar="Excluir"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </>
  );
}

/**
 * Protocolos (`/protocolos`, docs/inventario/telas/gestao-profissionais-protocolos.md): abas
 * Protocolos, Protocolos Mãe, Receitas e Solic. Exames. Receitas e Solic. Exames ainda não têm
 * cadastro definido: mostram só os filtros e o estado vazio.
 */
export default function ProtocolosPage() {
  const [aba, setAba] = useState<AbaId>('protocolos');
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [profissionalId, setProfissionalId] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [criando, setCriando] = useState(false);
  const search = useDebounce(busca.trim(), DEBOUNCE_BUSCA_MS);
  const atual = ABAS.find((a) => a.id === aba) ?? ABAS[0];
  const permissaoCriar = 'gestao-profissionais.protocolos.criar';

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Protocolos"
        descricao="Conjuntos de procedimentos/produtos para aplicar no atendimento"
        breadcrumb={BREADCRUMB}
        acoes={
          <SePermitido permissao={permissaoCriar}>
            <Button
              type="button"
              disabled={aba === 'receitas' || aba === 'exames'}
              title={aba === 'receitas' || aba === 'exames' ? 'Disponível em breve' : undefined}
              onClick={() => setCriando(true)}
            >
              <PlusIcon aria-hidden />
              {atual.novo}
            </Button>
          </SePermitido>
        }
      />
      <div
        role="tablist"
        aria-label="Seções de Protocolos"
        className="flex w-fit flex-wrap gap-1 rounded-lg bg-muted p-1"
      >
        {ABAS.map(({ id, rotulo }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`aba-${id}`}
            aria-selected={aba === id}
            aria-controls="painel-aba"
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              aba === id
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => {
              setAba(id);
              setCriando(false);
            }}
          >
            {rotulo}
          </button>
        ))}
      </div>
      <div id="painel-aba" role="tabpanel" aria-labelledby={`aba-${aba}`} className="grid gap-4">
        {aba !== 'mae' && (
          <Filtros
            busca={busca}
            onBusca={(valor) => {
              setBusca(valor);
              setPagina(1);
            }}
            categoria={categoria}
            onCategoria={(valor) => {
              setCategoria(valor);
              setPagina(1);
            }}
            profissionalId={profissionalId}
            onProfissional={(valor) => {
              setProfissionalId(valor);
              setPagina(1);
            }}
          />
        )}
        {aba === 'protocolos' && (
          <AbaProtocolos
            search={search}
            categoria={categoria}
            profissionalId={profissionalId}
            pagina={pagina}
            onPagina={setPagina}
          />
        )}
        {aba === 'mae' && (
          <ProtocolosMaeAba criando={criando} onFecharCriar={() => setCriando(false)} />
        )}
        {(aba === 'receitas' || aba === 'exames') && (
          <div className="rounded-xl border bg-card">
            <EmptyState
              icone={ClipboardListIcon}
              titulo="Nenhum protocolo cadastrado"
              descricao="Crie protocolos com itens de produtos/serviços"
            />
          </div>
        )}
      </div>
      {criando && aba === 'protocolos' && <ModalProtocolo onFechar={() => setCriando(false)} />}
    </div>
  );
}
