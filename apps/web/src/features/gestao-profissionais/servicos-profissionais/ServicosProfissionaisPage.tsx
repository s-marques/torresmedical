import type { ServicoProfissional } from '@torres/shared';
import {
  BriefcaseBusinessIcon,
  PencilIcon,
  PlusIcon,
  PowerIcon,
  PowerOffIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { EntitySelect } from '@/components/shared/EntitySelect';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebounce } from '@/hooks/use-debounce';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { cn } from '@/lib/utils';
import { ModalServico } from './ModalServico';
import {
  useAlterarStatusServico,
  useExcluirServico,
  useServicos,
} from './use-servicos-profissionais';

const BREADCRUMB = [
  { rotulo: 'Painel', para: '/' },
  { rotulo: 'Gestão Profissionais' },
  { rotulo: 'Serviços Profissionais' },
];

const DEBOUNCE_BUSCA_MS = 300;

function agruparPorProfissional(servicos: readonly ServicoProfissional[]) {
  const grupos = new Map<string, ServicoProfissional[]>();
  for (const servico of servicos) {
    const grupo = grupos.get(servico.profissionalId) ?? [];
    grupo.push(servico);
    grupos.set(servico.profissionalId, grupo);
  }
  return [...grupos.values()];
}

interface LinhaServicoProps {
  servico: ServicoProfissional;
  onEditar: () => void;
  onAlterarStatus: () => void;
  onExcluir: () => void;
}

function LinhaServico({
  servico,
  onEditar,
  onAlterarStatus,
  onExcluir,
}: Readonly<LinhaServicoProps>) {
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3" data-ativo={servico.ativo}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={cn('font-medium', !servico.ativo && 'text-muted-foreground')}>
            {servico.nome}
          </h3>
          {servico.categoria && <Badge variant="secondary">{servico.categoria}</Badge>}
          {!servico.ativo && <StatusBadge tom="perigo">Inativo</StatusBadge>}
        </div>
        {servico.descricao && (
          <p className="truncate text-sm text-muted-foreground">{servico.descricao}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="text-sm text-muted-foreground">{servico.duracaoMinutos}min</span>
        <span className="font-semibold text-emerald-600">{formatarMoeda(servico.valor)}</span>
        <div className="flex items-center gap-1">
          <SePermitido permissao="gestao-profissionais.servicos-profissionais.editar">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Editar ${servico.nome}`}
              onClick={onEditar}
            >
              <PencilIcon aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`${servico.ativo ? 'Desativar' : 'Ativar'} ${servico.nome}`}
              title={servico.ativo ? 'Desativar' : 'Ativar'}
              onClick={onAlterarStatus}
            >
              {servico.ativo ? <PowerOffIcon aria-hidden /> : <PowerIcon aria-hidden />}
            </Button>
          </SePermitido>
          <SePermitido permissao="gestao-profissionais.servicos-profissionais.excluir">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-destructive hover:text-destructive"
              aria-label={`Excluir ${servico.nome}`}
              title={
                servico.emUso ? 'Em uso em outro cadastro: desative em vez de excluir' : 'Excluir'
              }
              disabled={servico.emUso}
              onClick={onExcluir}
            >
              <Trash2Icon aria-hidden />
            </Button>
          </SePermitido>
        </div>
      </div>
    </li>
  );
}

/**
 * Serviços Profissionais (`/servicos-profissionais`,
 * docs/inventario/telas/gestao-profissionais-servicos-profissionais.md): serviços/procedimentos
 * que cada profissional realiza, agrupados por profissional.
 */
export default function ServicosProfissionaisPage() {
  const [busca, setBusca] = useState('');
  const [profissionalId, setProfissionalId] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<ServicoProfissional | null>(null);
  const [desativando, setDesativando] = useState<ServicoProfissional | null>(null);
  const [excluindo, setExcluindo] = useState<ServicoProfissional | null>(null);
  const search = useDebounce(busca.trim(), DEBOUNCE_BUSCA_MS);
  const servicos = useServicos({ search, profissionalId, page: pagina });
  const alterarStatus = useAlterarStatusServico();
  const excluir = useExcluirServico();

  const dados = servicos.data;
  const total = dados?.meta.total ?? 0;

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Serviços por Profissional"
        descricao="Cadastre os serviços/procedimentos que cada profissional realiza"
        breadcrumb={BREADCRUMB}
        acoes={
          <SePermitido permissao="gestao-profissionais.servicos-profissionais.criar">
            <Button type="button" onClick={() => setCriando(true)}>
              <PlusIcon aria-hidden />
              Novo Serviço
            </Button>
          </SePermitido>
        }
      />
      <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4">
        <div className="grid gap-1.5">
          <Label htmlFor="busca-servico">Buscar</Label>
          <div className="relative">
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="busca-servico"
              className="w-56 pl-8"
              value={busca}
              onChange={(evento) => {
                setBusca(evento.target.value);
                setPagina(1);
              }}
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label id="rotulo-profissional-servico">Profissional</Label>
          <EntitySelect
            entidade="profissionais"
            value={profissionalId}
            onChange={(id) => {
              setProfissionalId(id);
              setPagina(1);
            }}
            placeholder="Todos"
            aria-labelledby="rotulo-profissional-servico"
            className="w-64"
          />
        </div>
        {dados && <p className="pb-2 text-sm text-muted-foreground">{total} serviço(s)</p>}
      </div>
      {servicos.isPending && (
        <div className="grid gap-3" aria-busy>
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-16 rounded-xl" />
          ))}
        </div>
      )}
      {servicos.isError && (
        <EmptyState
          titulo="Não foi possível carregar os serviços."
          acao={
            <Button type="button" variant="outline" onClick={() => void servicos.refetch()}>
              Tentar de novo
            </Button>
          }
        />
      )}
      {dados && dados.data.length === 0 && (
        <EmptyState icone={BriefcaseBusinessIcon} titulo="Nenhum serviço encontrado." />
      )}
      {dados &&
        agruparPorProfissional(dados.data).map((grupo) => (
          <section key={grupo[0]?.profissionalId} className="grid gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase">
              {grupo[0]?.profissionalNome}
            </h2>
            <ul className="divide-y rounded-xl border bg-card">
              {grupo.map((servico) => (
                <LinhaServico
                  key={servico.id}
                  servico={servico}
                  onEditar={() => setEditando(servico)}
                  onAlterarStatus={() =>
                    servico.ativo
                      ? setDesativando(servico)
                      : void alterarStatus.mutateAsync({ id: servico.id, ativo: true })
                  }
                  onExcluir={() => setExcluindo(servico)}
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
            onClick={() => setPagina(pagina - 1)}
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
            onClick={() => setPagina(pagina + 1)}
          >
            Próxima
          </Button>
        </div>
      )}
      {criando && (
        <ModalServico profissionalId={profissionalId} onFechar={() => setCriando(false)} />
      )}
      {editando && <ModalServico servico={editando} onFechar={() => setEditando(null)} />}
      <ConfirmDialog
        aberto={desativando !== null}
        onAbertoChange={(aberto) => aberto || setDesativando(null)}
        titulo="Desativar serviço?"
        descricao={`O serviço "${desativando?.nome ?? ''}" continua na lista como Inativo e pode ser reativado depois.`}
        rotuloConfirmar="Desativar"
        onConfirmar={() =>
          desativando ? alterarStatus.mutateAsync({ id: desativando.id, ativo: false }) : undefined
        }
      />
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir serviço?"
        descricao={`O serviço "${excluindo?.nome ?? ''}" será excluído definitivamente. Esta ação não pode ser desfeita.`}
        rotuloConfirmar="Excluir"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
