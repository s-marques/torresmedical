import {
  exportOrigensClienteQuerySchema,
  listOrigensClienteQuerySchema,
  origemClientePageSchema,
  type OrigemCliente,
} from '@torres/shared';
import { ArrowDownIcon, ArrowUpIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, ExportacaoGrid, FiltroStatus } from '@/components/shared/data-grid/tipos';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { usePermissao } from '@/lib/auth/use-sessao';
import { ModalOrigemCliente } from './ModalOrigemCliente';
import {
  URL_ORIGENS_CLIENTE,
  useAlterarAtivaOrigem,
  useExcluirOrigem,
  useMoverOrigem,
} from './use-origens-cliente';

const STATUS: FiltroStatus = {
  opcoes: [
    { valor: 'ativo', rotulo: 'Ativa' },
    { valor: 'inativo', rotulo: 'Inativa' },
  ],
};

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'comercial-atendimento.origens-cliente.exportar',
  nomeArquivo: 'origens-cliente',
  schema: exportOrigensClienteQuerySchema,
};

const TAMANHOS_PAGINA = [50, 100] as const;

/**
 * Origens de Cliente (`/origens-cliente`,
 * docs/inventario/telas/comercial-atendimento-origens-de-cliente.md): de onde os pacientes
 * chegam, usado no cadastro de clientes e nos relatórios de captação.
 */
export default function OrigensClientePage() {
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<OrigemCliente | null>(null);
  const [excluindo, setExcluindo] = useState<OrigemCliente | null>(null);
  const podeEditar = usePermissao('comercial-atendimento.origens-cliente.editar');
  const mover = useMoverOrigem();
  const alterarAtiva = useAlterarAtivaOrigem();
  const excluir = useExcluirOrigem();

  const colunas: ColunaGrid<OrigemCliente>[] = [
    {
      id: 'ordem',
      titulo: 'Ordem',
      ordenavel: true,
      exportavel: true,
      celula: (origem) => (
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Mover ${origem.nome} para cima`}
            disabled={!podeEditar || mover.isPending}
            onClick={() => mover.mutate({ id: origem.id, direcao: 'cima' })}
          >
            <ArrowUpIcon aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Mover ${origem.nome} para baixo`}
            disabled={!podeEditar || mover.isPending}
            onClick={() => mover.mutate({ id: origem.id, direcao: 'baixo' })}
          >
            <ArrowDownIcon aria-hidden />
          </Button>
        </div>
      ),
    },
    { id: 'nome', titulo: 'Nome', ordenavel: true, exportavel: true, ocultavel: false },
    {
      id: 'codigo',
      titulo: 'Código',
      ordenavel: true,
      exportavel: true,
      celula: (origem) => <code className="text-xs text-muted-foreground">{origem.codigo}</code>,
    },
    {
      id: 'ativa',
      titulo: 'Ativa',
      ordenavel: true,
      exportavel: true,
      celula: (origem) => (
        <Switch
          checked={origem.ativa}
          disabled={!podeEditar || alterarAtiva.isPending}
          aria-label={`${origem.ativa ? 'Desativar' : 'Ativar'} ${origem.nome}`}
          onCheckedChange={(ativa) => alterarAtiva.mutate({ id: origem.id, ativa })}
        />
      ),
    },
    {
      id: 'acoes',
      titulo: 'Ações',
      ocultavel: false,
      celula: (origem) => (
        <div className="flex items-center gap-1">
          <SePermitido permissao="comercial-atendimento.origens-cliente.editar">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Renomear ${origem.nome}`}
              onClick={() => setEditando(origem)}
            >
              <PencilIcon aria-hidden />
            </Button>
          </SePermitido>
          <SePermitido permissao="comercial-atendimento.origens-cliente.excluir">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-destructive hover:text-destructive"
              aria-label={`Excluir ${origem.nome}`}
              onClick={() => setExcluindo(origem)}
            >
              <Trash2Icon aria-hidden />
            </Button>
          </SePermitido>
        </div>
      ),
    },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Origens de Cliente"
        descricao="De onde os pacientes chegam — usado no cadastro de clientes e nos relatórios de captação."
        acoes={
          <SePermitido permissao="comercial-atendimento.origens-cliente.criar">
            <Button type="button" onClick={() => setCriando(true)}>
              <PlusIcon aria-hidden />
              Nova Origem
            </Button>
          </SePermitido>
        }
      />
      <DataGrid
        url={URL_ORIGENS_CLIENTE}
        schema={origemClientePageSchema}
        querySchema={listOrigensClienteQuerySchema}
        colunas={colunas}
        busca="Buscar origens..."
        status={STATUS}
        exportacao={EXPORTACAO}
        tamanhosPagina={TAMANHOS_PAGINA}
        mensagemVazio="Nenhuma origem encontrada."
      />
      {criando && <ModalOrigemCliente onFechar={() => setCriando(false)} />}
      {editando && <ModalOrigemCliente origem={editando} onFechar={() => setEditando(null)} />}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir origem"
        descricao={`Excluir a origem "${excluindo?.nome ?? ''}"? Só é possível se nenhum cliente estiver usando.`}
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
