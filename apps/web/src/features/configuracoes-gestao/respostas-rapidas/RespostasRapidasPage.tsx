import type { RespostaRapida } from '@torres/shared';
import {
  MessageSquareTextIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  ZapIcon,
} from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebounce } from '@/hooks/use-debounce';
import { ModalRespostaRapida } from './ModalRespostaRapida';
import { useExcluirResposta, useRespostasRapidas } from './use-respostas-rapidas';

const BREADCRUMB = [
  { rotulo: 'Painel', para: '/' },
  { rotulo: 'Configurações' },
  { rotulo: 'Respostas Rápidas' },
];

const DEBOUNCE_BUSCA_MS = 300;

interface CardRespostaProps {
  resposta: RespostaRapida;
  onEditar: () => void;
  onExcluir: () => void;
}

function CardResposta({ resposta, onEditar, onExcluir }: Readonly<CardRespostaProps>) {
  return (
    <li className="grid content-start gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 truncate text-base font-medium">{resposta.titulo}</h2>
        <div className="-mt-1 flex shrink-0 items-center gap-1">
          <SePermitido permissao="configuracoes-gestao.respostas-rapidas.editar">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Editar ${resposta.titulo}`}
              onClick={onEditar}
            >
              <PencilIcon aria-hidden />
            </Button>
          </SePermitido>
          <SePermitido permissao="configuracoes-gestao.respostas-rapidas.excluir">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-destructive hover:text-destructive"
              aria-label={`Excluir ${resposta.titulo}`}
              onClick={onExcluir}
            >
              <Trash2Icon aria-hidden />
            </Button>
          </SePermitido>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{resposta.categoria}</Badge>
        {resposta.atalho && (
          <Badge variant="outline" className="font-mono">
            <ZapIcon aria-hidden />
            {resposta.atalho}
          </Badge>
        )}
      </div>
      <p className="line-clamp-3 text-sm whitespace-pre-line text-muted-foreground">
        {resposta.mensagem}
      </p>
    </li>
  );
}

/**
 * Respostas Rápidas (`/respostas-rapidas`,
 * docs/inventario/telas/configuracoes-gestao-respostas-rapidas.md): mensagens padrão para uso no
 * atendimento WhatsApp, em cards com busca (sem tabela ou paginação no sistema atual).
 */
export default function RespostasRapidasPage() {
  const [busca, setBusca] = useState('');
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<RespostaRapida | null>(null);
  const [excluindo, setExcluindo] = useState<RespostaRapida | null>(null);
  const search = useDebounce(busca.trim(), DEBOUNCE_BUSCA_MS);
  const respostas = useRespostasRapidas(search);
  const excluir = useExcluirResposta();

  const lista = respostas.data?.data;

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Respostas Rápidas"
        descricao="Mensagens padrão para uso no atendimento WhatsApp"
        breadcrumb={BREADCRUMB}
        acoes={
          <SePermitido permissao="configuracoes-gestao.respostas-rapidas.criar">
            <Button type="button" onClick={() => setCriando(true)}>
              <PlusIcon aria-hidden />
              Nova Resposta
            </Button>
          </SePermitido>
        }
      />
      <div className="relative w-full max-w-sm">
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label="Buscar respostas rápidas"
          placeholder="Buscar..."
          className="pl-8"
          value={busca}
          onChange={(evento) => setBusca(evento.target.value)}
        />
      </div>
      {respostas.isPending && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy>
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-32 rounded-xl" />
          ))}
        </div>
      )}
      {respostas.isError && (
        <EmptyState
          titulo="Não foi possível carregar as respostas rápidas."
          acao={
            <Button type="button" variant="outline" onClick={() => void respostas.refetch()}>
              Tentar de novo
            </Button>
          }
        />
      )}
      {lista?.length === 0 &&
        (search ? (
          <EmptyState icone={SearchIcon} titulo="Nenhuma resposta rápida encontrada." />
        ) : (
          <EmptyState
            icone={MessageSquareTextIcon}
            titulo="Nenhuma resposta rápida cadastrada"
            acao={
              <SePermitido permissao="configuracoes-gestao.respostas-rapidas.criar">
                <Button type="button" variant="outline" onClick={() => setCriando(true)}>
                  Criar primeira resposta
                </Button>
              </SePermitido>
            }
          />
        ))}
      {lista && lista.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((resposta) => (
            <CardResposta
              key={resposta.id}
              resposta={resposta}
              onEditar={() => setEditando(resposta)}
              onExcluir={() => setExcluindo(resposta)}
            />
          ))}
        </ul>
      )}
      {criando && <ModalRespostaRapida onFechar={() => setCriando(false)} />}
      {editando && <ModalRespostaRapida resposta={editando} onFechar={() => setEditando(null)} />}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir resposta rápida"
        descricao={`Deseja excluir a resposta rápida "${excluindo?.titulo ?? ''}"?`}
        rotuloConfirmar="Confirmar"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
