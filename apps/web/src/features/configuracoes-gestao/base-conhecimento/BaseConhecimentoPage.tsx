import type { DocumentoConhecimento, DocumentoConhecimentoCategoria } from '@torres/shared';
import { DOCUMENTO_CONHECIMENTO_CATEGORIAS } from '@torres/shared';
import { FileTextIcon, PencilIcon, PlusIcon, SearchIcon } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { EntitySelect } from '@/components/shared/EntitySelect';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebounce } from '@/hooks/use-debounce';
import { useItemLookup } from '@/lib/api/lookups';
import { ModalDocumentoConhecimento } from './ModalDocumentoConhecimento';
import { useDocumentosConhecimento } from './use-base-conhecimento';

const BREADCRUMB = [
  { rotulo: 'Painel', para: '/' },
  { rotulo: 'Configurações' },
  { rotulo: 'Base de Conhecimento' },
];

const DEBOUNCE_BUSCA_MS = 300;
const TODAS = '__todas__';

function NomeProfissional({ profissionalId }: Readonly<{ profissionalId: string | null }>) {
  const profissional = useItemLookup('profissionais', profissionalId);
  if (!profissionalId) return <>Geral (todos os profissionais)</>;
  return <>{profissional.data?.label ?? '…'}</>;
}

interface CardDocumentoProps {
  documento: DocumentoConhecimento;
  onEditar: () => void;
}

function CardDocumento({ documento, onEditar }: Readonly<CardDocumentoProps>) {
  return (
    <li className="grid content-start gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 truncate text-base font-medium">{documento.titulo}</h2>
        <SePermitido permissao="configuracoes-gestao.base-conhecimento.editar">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="-mt-1 shrink-0"
            aria-label={`Editar ${documento.titulo}`}
            onClick={onEditar}
          >
            <PencilIcon aria-hidden />
          </Button>
        </SePermitido>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{documento.categoria}</Badge>
        <Badge variant="outline">
          <NomeProfissional profissionalId={documento.profissionalId} />
        </Badge>
        {documento.indexadoEm && <Badge variant="outline">Indexado</Badge>}
      </div>
      <p className="line-clamp-3 text-sm whitespace-pre-line text-muted-foreground">
        {documento.conteudo}
      </p>
    </li>
  );
}

/**
 * Base de Conhecimento (`/base-conhecimento`,
 * docs/inventario/telas/configuracoes-gestao-base-de-conhecimento.md): informações que o agente
 * de IA usa para responder pacientes, em cards com busca e filtros (sem tabela ou paginação no
 * sistema atual).
 */
export default function BaseConhecimentoPage() {
  const [busca, setBusca] = useState('');
  const [profissionalId, setProfissionalId] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<DocumentoConhecimentoCategoria | null>(null);
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<DocumentoConhecimento | null>(null);
  const search = useDebounce(busca.trim(), DEBOUNCE_BUSCA_MS);
  const documentos = useDocumentosConhecimento({ search, profissionalId, categoria });

  const lista = documentos.data?.data;
  const filtrando = Boolean(search || profissionalId || categoria);

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Base de Conhecimento"
        descricao="Informações que o agente IA usa para responder pacientes (procedimentos, preparos, FAQs, convênios)"
        breadcrumb={BREADCRUMB}
        acoes={
          <SePermitido permissao="configuracoes-gestao.base-conhecimento.criar">
            <Button type="button" onClick={() => setCriando(true)}>
              <PlusIcon aria-hidden />
              Novo Documento
            </Button>
          </SePermitido>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Buscar documentos"
            placeholder="Buscar..."
            className="pl-8"
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
          />
        </div>
        <EntitySelect
          entidade="profissionais"
          value={profissionalId}
          onChange={setProfissionalId}
          placeholder="Todos"
          aria-label="Profissional"
          className="w-64"
        />
        <Select
          value={categoria ?? TODAS}
          onValueChange={(valor) =>
            setCategoria(valor === TODAS ? null : (valor as DocumentoConhecimentoCategoria))
          }
        >
          <SelectTrigger aria-label="Categoria" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas</SelectItem>
            {DOCUMENTO_CONHECIMENTO_CATEGORIAS.map((opcao) => (
              <SelectItem key={opcao} value={opcao}>
                {opcao}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {documentos.isPending && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy>
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-32 rounded-xl" />
          ))}
        </div>
      )}
      {documentos.isError && (
        <EmptyState
          titulo="Não foi possível carregar os documentos."
          acao={
            <Button type="button" variant="outline" onClick={() => void documentos.refetch()}>
              Tentar de novo
            </Button>
          }
        />
      )}
      {lista?.length === 0 &&
        (filtrando ? (
          <EmptyState icone={SearchIcon} titulo="Nenhum documento encontrado." />
        ) : (
          <EmptyState
            icone={FileTextIcon}
            titulo="Nenhum documento cadastrado"
            acao={
              <SePermitido permissao="configuracoes-gestao.base-conhecimento.criar">
                <Button type="button" variant="outline" onClick={() => setCriando(true)}>
                  Criar primeiro documento
                </Button>
              </SePermitido>
            }
          />
        ))}
      {lista && lista.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((documento) => (
            <CardDocumento
              key={documento.id}
              documento={documento}
              onEditar={() => setEditando(documento)}
            />
          ))}
        </ul>
      )}
      {criando && <ModalDocumentoConhecimento onFechar={() => setCriando(false)} />}
      {editando && (
        <ModalDocumentoConhecimento documento={editando} onFechar={() => setEditando(null)} />
      )}
    </div>
  );
}
