import {
  exportMensalidadesQuerySchema,
  listMensalidadesQuerySchema,
  mensalidadePageSchema,
  type Mensalidade,
  type MensalidadeStatus,
} from '@torres/shared';
import { BanIcon, PauseIcon, PencilIcon, PlayIcon, PlusIcon, ReceiptIcon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type {
  AcaoLinha,
  ColunaGrid,
  ExportacaoGrid,
  FiltroStatus,
} from '@/components/shared/data-grid/tipos';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { formatarData } from '@/lib/formatar';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { ModalGerarTitulos } from './ModalGerarTitulos';
import { ModalMensalidade } from './ModalMensalidade';
import { StatusMensalidade } from './StatusMensalidade';
import { URL_MENSALIDADES, useMudarStatusMensalidade } from './use-mensalidades';

const PERMISSAO_EDITAR = 'comercial-atendimento.mensalidades.editar';

const STATUS: FiltroStatus = {
  opcoes: [
    { valor: 'ATIVO', rotulo: 'Ativo' },
    { valor: 'PAUSADO', rotulo: 'Pausado' },
    { valor: 'CANCELADO', rotulo: 'Cancelado' },
  ],
};

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'comercial-atendimento.mensalidades.exportar',
  nomeArquivo: 'mensalidades',
  schema: exportMensalidadesQuerySchema,
};

const COLUNAS: ColunaGrid<Mensalidade>[] = [
  { id: 'cliente', titulo: 'Cliente', ordenavel: true, exportavel: true },
  { id: 'descricao', titulo: 'Descrição', ordenavel: true, exportavel: true },
  {
    id: 'valor',
    titulo: 'Valor',
    ordenavel: true,
    exportavel: true,
    celula: (m) => formatarMoeda(Number(m.valor)),
  },
  { id: 'diaVencimento', titulo: 'Dia Venc.', ordenavel: true, exportavel: true },
  {
    id: 'dataInicio',
    titulo: 'Início',
    ordenavel: true,
    exportavel: true,
    celula: (m) => formatarData(m.dataInicio),
  },
  {
    id: 'dataFim',
    titulo: 'Fim',
    ordenavel: true,
    exportavel: true,
    celula: (m) => formatarData(m.dataFim),
  },
  {
    id: 'status',
    titulo: 'Status',
    ordenavel: true,
    exportavel: true,
    celula: (m) => <StatusMensalidade status={m.status} />,
  },
];

/** Confirmação de cada mudança de status (Pausar, Reativar, Cancelar). */
const CONFIRMACOES: Record<
  MensalidadeStatus,
  { titulo: string; rotulo: string; descricao: string; destrutivo: boolean }
> = {
  PAUSADO: {
    titulo: 'Pausar Mensalidade',
    rotulo: 'Pausar',
    descricao: 'Enquanto pausada, ela não gera títulos. Os títulos já gerados continuam.',
    destrutivo: false,
  },
  ATIVO: {
    titulo: 'Reativar Mensalidade',
    rotulo: 'Reativar',
    descricao: 'Ela volta a gerar títulos no "Gerar Títulos do Mês".',
    destrutivo: false,
  },
  CANCELADO: {
    titulo: 'Cancelar Mensalidade',
    rotulo: 'Cancelar mensalidade',
    descricao:
      'Ela não gera mais títulos e não pode ser reativada. Os títulos já gerados continuam.',
    destrutivo: true,
  },
};

interface MudancaStatus {
  mensalidade: Mensalidade;
  status: MensalidadeStatus;
}

function acoesDaLinha(
  m: Mensalidade,
  editar: (m: Mensalidade) => void,
  mudar: (mudanca: MudancaStatus) => void,
): AcaoLinha[] {
  if (m.status === 'CANCELADO') return [];
  const acoes: AcaoLinha[] = [
    { rotulo: 'Editar', icone: PencilIcon, permissao: PERMISSAO_EDITAR, onSelect: () => editar(m) },
  ];
  if (m.status === 'ATIVO') {
    acoes.push({
      rotulo: 'Pausar',
      icone: PauseIcon,
      permissao: PERMISSAO_EDITAR,
      onSelect: () => mudar({ mensalidade: m, status: 'PAUSADO' }),
    });
  } else {
    acoes.push({
      rotulo: 'Reativar',
      icone: PlayIcon,
      permissao: PERMISSAO_EDITAR,
      onSelect: () => mudar({ mensalidade: m, status: 'ATIVO' }),
    });
  }
  acoes.push({
    rotulo: 'Cancelar',
    icone: BanIcon,
    destrutiva: true,
    permissao: PERMISSAO_EDITAR,
    onSelect: () => mudar({ mensalidade: m, status: 'CANCELADO' }),
  });
  return acoes;
}

/**
 * Mensalidades (`/mensalidades`, docs/inventario/telas/comercial-atendimento-mensalidades.md):
 * cobranças recorrentes mensais de pacientes, com "Gerar Titulos do Mes" em Contas a Receber.
 */
export default function MensalidadesPage() {
  const [criando, setCriando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [editando, setEditando] = useState<Mensalidade | null>(null);
  const [mudanca, setMudanca] = useState<MudancaStatus | null>(null);
  const mudarStatus = useMudarStatusMensalidade();
  const confirmacao = mudanca ? CONFIRMACOES[mudanca.status] : null;

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Mensalidades"
        descricao="Controle de cobranças recorrentes mensais."
        acoes={
          <SePermitido permissao="comercial-atendimento.mensalidades.criar">
            <Button type="button" variant="outline" onClick={() => setGerando(true)}>
              <ReceiptIcon aria-hidden />
              Gerar Títulos do Mês
            </Button>
            <Button type="button" onClick={() => setCriando(true)}>
              <PlusIcon aria-hidden />
              Nova Mensalidade
            </Button>
          </SePermitido>
        }
      />
      <DataGrid
        url={URL_MENSALIDADES}
        schema={mensalidadePageSchema}
        querySchema={listMensalidadesQuerySchema}
        colunas={COLUNAS}
        busca="Buscar mensalidades..."
        status={STATUS}
        exportacao={EXPORTACAO}
        acoes={(m) => acoesDaLinha(m, setEditando, setMudanca)}
        mensagemVazio="Nenhuma mensalidade encontrada."
      />
      {criando && <ModalMensalidade onFechar={() => setCriando(false)} />}
      {editando && <ModalMensalidade mensalidade={editando} onFechar={() => setEditando(null)} />}
      {gerando && <ModalGerarTitulos onFechar={() => setGerando(false)} />}
      <ConfirmDialog
        aberto={mudanca !== null}
        onAbertoChange={(aberto) => aberto || setMudanca(null)}
        titulo={confirmacao?.titulo ?? ''}
        descricao={
          mudanca
            ? `"${mudanca.mensalidade.descricao}" de ${mudanca.mensalidade.cliente}. ${confirmacao?.descricao ?? ''}`
            : undefined
        }
        rotuloConfirmar={confirmacao?.rotulo}
        rotuloCancelar="Voltar"
        destrutivo={confirmacao?.destrutivo ?? true}
        onConfirmar={() =>
          mudanca
            ? mudarStatus.mutateAsync({ id: mudanca.mensalidade.id, status: mudanca.status })
            : undefined
        }
      />
    </div>
  );
}
