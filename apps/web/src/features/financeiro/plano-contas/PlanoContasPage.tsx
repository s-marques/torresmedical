import { PLANO_CONTA_ROTULO_TIPO, type PlanoConta, type PlanoContaTipo } from '@torres/shared';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PencilIcon,
  PlusIcon,
  PrinterIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useExportacao } from '@/components/shared/data-grid/use-exportacao';
import { EmptyState } from '@/components/shared/EmptyState';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePermissao } from '@/lib/auth/use-sessao';
import { idsComFilhas, linhasVisiveis } from './arvore';
import { ModalPlanoConta } from './ModalPlanoConta';
import { OPCOES_TIPO } from './opcoes';
import {
  URL_PLANO_CONTAS,
  useAlterarAtivaConta,
  useExcluirConta,
  usePlanoContas,
} from './use-plano-contas';

const TODOS = 'todos';
const RECUO_REM = 1.25;

const TOM_TIPO: Record<PlanoConta['tipo'], TomStatus> = {
  RECEITA: 'sucesso',
  DESPESA: 'perigo',
  ATIVO: 'info',
  PASSIVO: 'alerta',
};

/**
 * Plano de Contas (`/plano-contas`, docs/inventario/telas/financeiro-plano-de-contas.md): árvore de
 * contas com Expandir Tudo/Recolher, busca, filtro de Tipo e Imprimir. Com busca ou filtro ativo,
 * a lista fica plana (só as contas encontradas), sem hierarquia.
 */
export default function PlanoContasPage() {
  const [search, setSearch] = useState('');
  const [tipo, setTipo] = useState<PlanoContaTipo | undefined>();
  const [expandidas, setExpandidas] = useState<ReadonlySet<string>>(new Set());
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<PlanoConta | null>(null);
  const [excluindo, setExcluindo] = useState<PlanoConta | null>(null);

  const termo = search.trim();
  const filtrando = termo !== '' || tipo !== undefined;
  const consulta = usePlanoContas({ search: termo, tipo });
  const contas = useMemo(() => consulta.data?.data ?? [], [consulta.data]);
  const todas = usePlanoContas({ search: '' });
  const todasContas = todas.data?.data ?? [];

  const podeEditar = usePermissao('financeiro.plano-contas.editar');
  const alterarAtiva = useAlterarAtivaConta();
  const excluir = useExcluirConta();
  const impressao = useExportacao({
    url: `${URL_PLANO_CONTAS}/export`,
    permissao: 'financeiro.plano-contas.exportar',
    nomeArquivo: 'plano-contas',
    consultaFixa: { ...(termo ? { search: termo } : {}), ...(tipo ? { tipo } : {}) },
  });

  const linhas = useMemo(
    () => linhasVisiveis(contas, expandidas, filtrando),
    [contas, expandidas, filtrando],
  );

  function alternar(id: string) {
    setExpandidas((atual) => {
      const proximo = new Set(atual);
      if (!proximo.delete(id)) proximo.add(id);
      return proximo;
    });
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Plano de Contas"
        descricao="Estrutura hierárquica de contas contábeis"
        acoes={
          <div className="flex items-center gap-2">
            {impressao.permitido && (
              <Button
                type="button"
                variant="outline"
                disabled={impressao.exportando}
                onClick={() => impressao.exportar('pdf')}
              >
                <PrinterIcon aria-hidden />
                Imprimir
              </Button>
            )}
            <SePermitido permissao="financeiro.plano-contas.criar">
              <Button type="button" onClick={() => setCriando(true)}>
                <PlusIcon aria-hidden />
                Nova Conta
              </Button>
            </SePermitido>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Buscar"
            placeholder="Buscar..."
            className="pl-9"
            value={search}
            onChange={(evento) => setSearch(evento.target.value)}
          />
        </div>
        <Select
          value={tipo ?? TODOS}
          onValueChange={(valor) =>
            setTipo(valor === TODOS ? undefined : (valor as PlanoContaTipo))
          }
        >
          <SelectTrigger aria-label="Tipo" size="sm" className="min-w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos</SelectItem>
            {OPCOES_TIPO.map((opcao) => (
              <SelectItem key={opcao.valor} value={opcao.valor}>
                {opcao.rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={filtrando}
          onClick={() => setExpandidas(idsComFilhas(contas))}
        >
          Expandir Tudo
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={filtrando}
          onClick={() => setExpandidas(new Set())}
        >
          Recolher
        </Button>
        <span className="ml-auto text-sm text-muted-foreground" aria-live="polite">
          {contas.length} {contas.length === 1 ? 'conta' : 'contas'}
        </span>
      </div>

      {linhas.length === 0 && !consulta.isPending ? (
        <EmptyState titulo="Nenhuma conta encontrada." />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Nível</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map(({ conta, temFilhas }) => {
                const aberta = expandidas.has(conta.id);
                return (
                  <TableRow key={conta.id} data-testid={`conta-${conta.codigo}`}>
                    <TableCell className="font-mono text-sm">{conta.codigo}</TableCell>
                    <TableCell>
                      <div
                        className="flex items-center gap-1"
                        style={{
                          paddingLeft: `${(filtrando ? 0 : conta.nivel - 1) * RECUO_REM}rem`,
                        }}
                      >
                        {!filtrando &&
                          (temFilhas ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-expanded={aberta}
                              aria-label={`${aberta ? 'Recolher' : 'Expandir'} ${conta.codigo}`}
                              onClick={() => alternar(conta.id)}
                            >
                              {aberta ? (
                                <ChevronDownIcon aria-hidden />
                              ) : (
                                <ChevronRightIcon aria-hidden />
                              )}
                            </Button>
                          ) : (
                            <span aria-hidden className="inline-block size-8" />
                          ))}
                        <span className={temFilhas ? 'font-medium' : undefined}>{conta.nome}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tom={TOM_TIPO[conta.tipo]}>
                        {PLANO_CONTA_ROTULO_TIPO[conta.tipo]}
                      </StatusBadge>
                    </TableCell>
                    <TableCell>{conta.nivel}</TableCell>
                    <TableCell>
                      <Switch
                        checked={conta.ativo}
                        aria-label={`${conta.ativo ? 'Desativar' : 'Ativar'} ${conta.codigo}`}
                        disabled={!podeEditar || alterarAtiva.isPending}
                        onCheckedChange={(ativo) => alterarAtiva.mutate({ id: conta.id, ativo })}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <SePermitido permissao="financeiro.plano-contas.editar">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Editar ${conta.codigo}`}
                            title="Editar"
                            onClick={() => setEditando(conta)}
                          >
                            <PencilIcon aria-hidden />
                          </Button>
                        </SePermitido>
                        <SePermitido permissao="financeiro.plano-contas.excluir">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:text-destructive"
                            aria-label={`Excluir ${conta.codigo}`}
                            title="Excluir"
                            onClick={() => setExcluindo(conta)}
                          >
                            <Trash2Icon aria-hidden />
                          </Button>
                        </SePermitido>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {criando && <ModalPlanoConta contas={todasContas} onFechar={() => setCriando(false)} />}
      {editando && (
        <ModalPlanoConta conta={editando} contas={todasContas} onFechar={() => setEditando(null)} />
      )}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir Conta"
        descricao={`Deseja excluir a conta ${excluindo?.codigo ?? ''} - ${excluindo?.nome ?? ''}?`}
        rotuloConfirmar="Excluir"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
