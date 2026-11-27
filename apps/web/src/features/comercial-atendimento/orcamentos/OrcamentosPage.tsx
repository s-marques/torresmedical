import {
  exportOrcamentosQuerySchema,
  listOrcamentosQuerySchema,
  ORCAMENTO_ROTULO_STATUS,
  orcamentoPageSchema,
  type Orcamento,
} from '@torres/shared';
import { PlusIcon, XCircleIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, ExportacaoGrid, FiltroStatus } from '@/components/shared/data-grid/tipos';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { formatarData } from '@/lib/formatar';
import { ModalCancelarOrcamento } from './ModalCancelarOrcamento';
import { ModalNovoOrcamento } from './ModalNovoOrcamento';
import { URL_ORCAMENTOS } from './use-orcamentos';

const STATUS: FiltroStatus = {
  opcoes: [
    { valor: 'pendente', rotulo: 'Pendente' },
    { valor: 'aprovado', rotulo: 'Aprovado' },
    { valor: 'concluido', rotulo: 'Concluído' },
    { valor: 'cancelado', rotulo: 'Cancelado' },
  ],
};

const TOM_STATUS: Record<Orcamento['status'], TomStatus> = {
  PENDENTE: 'alerta',
  APROVADO: 'info',
  CONCLUIDO: 'sucesso',
  CANCELADO: 'perigo',
};

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'comercial-atendimento.orcamentos.exportar',
  nomeArquivo: 'orcamentos',
  schema: exportOrcamentosQuerySchema,
};

const COLUNAS: ColunaGrid<Orcamento>[] = [
  { id: 'id', titulo: '#', ordenavel: true, exportavel: true, celula: (o) => o.numero },
  {
    id: 'data',
    titulo: 'Data',
    ordenavel: true,
    exportavel: true,
    celula: (o) => formatarData(o.data),
  },
  { id: 'cliente', titulo: 'Cliente', ordenavel: true, exportavel: true },
  {
    id: 'total',
    titulo: 'Total',
    ordenavel: true,
    exportavel: true,
    celula: (o) => formatarMoeda(Number(o.total)),
  },
  {
    id: 'status',
    titulo: 'Status',
    ordenavel: true,
    exportavel: true,
    celula: (o) => (
      <StatusBadge tom={TOM_STATUS[o.status]}>{ORCAMENTO_ROTULO_STATUS[o.status]}</StatusBadge>
    ),
  },
];

/**
 * Orçamentos (`/orcamentos`, docs/inventario/telas/comercial-atendimento-orcamentos.md):
 * listagem e criação. Aprovar, concluir e o detalhe ficam fora: o inventário não traz print
 * dessas ações. O "Cancelar" (menu da linha) pede o motivo da lista (issue #162).
 */
export default function OrcamentosPage() {
  const { t } = useTranslation();
  const [criando, setCriando] = useState(false);
  const [cancelando, setCancelando] = useState<Orcamento | null>(null);

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Orçamentos"
        descricao="Crie e gerencie orçamentos para seus pacientes."
        acoes={
          <SePermitido permissao="comercial-atendimento.orcamentos.criar">
            <Button type="button" onClick={() => setCriando(true)}>
              <PlusIcon aria-hidden />
              Novo Orçamento
            </Button>
          </SePermitido>
        }
      />
      <DataGrid
        url={URL_ORCAMENTOS}
        schema={orcamentoPageSchema}
        querySchema={listOrcamentosQuerySchema}
        colunas={COLUNAS}
        busca="Buscar por cliente..."
        status={STATUS}
        exportacao={EXPORTACAO}
        mensagemVazio="Nenhum resultado."
        acoes={(orcamento) =>
          orcamento.status === 'PENDENTE' || orcamento.status === 'APROVADO'
            ? [
                {
                  rotulo: t('cancelamento.orcamento.acao'),
                  icone: XCircleIcon,
                  destrutiva: true,
                  permissao: 'comercial-atendimento.orcamentos.editar',
                  onSelect: () => setCancelando(orcamento),
                },
              ]
            : []
        }
      />
      {criando && <ModalNovoOrcamento onFechar={() => setCriando(false)} />}
      {cancelando && (
        <ModalCancelarOrcamento orcamento={cancelando} onFechar={() => setCancelando(null)} />
      )}
    </div>
  );
}
