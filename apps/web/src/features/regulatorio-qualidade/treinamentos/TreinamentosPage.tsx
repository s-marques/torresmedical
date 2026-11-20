import {
  exportTreinamentosQuerySchema,
  listTreinamentosQuerySchema,
  TREINAMENTO_STATUS,
  treinamentoPageSchema,
  type Treinamento,
} from '@torres/shared';
import { PlusIcon, TagIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, ExportacaoGrid, FiltroStatus } from '@/components/shared/data-grid/tipos';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { formatarData } from '@/lib/formatar';
import { ModalTipoTreinamento } from './ModalTipoTreinamento';
import { ModalTreinamento } from './ModalTreinamento';
import { StatusTreinamento } from './StatusTreinamento';
import { URL_TREINAMENTOS } from './use-treinamentos';

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'regulatorio-qualidade.treinamentos.exportar',
  nomeArquivo: 'treinamentos',
  schema: exportTreinamentosQuerySchema,
};

/**
 * Treinamentos (`/treinamentos`, docs/inventario/telas/regulatorio-qualidade-treinamentos.md):
 * controle de treinamentos e certificações dos funcionários, com as abas Todos, Válido e Vencido.
 */
export default function TreinamentosPage() {
  const { t } = useTranslation();
  const [modal, setModal] = useState<'treinamento' | 'tipo' | null>(null);

  const colunas = useMemo<ColunaGrid<Treinamento>[]>(() => {
    const titulo = (chave: string) => t(`treinamentos.colunas.${chave}`);
    return [
      {
        id: 'funcionario',
        titulo: titulo('funcionario'),
        ordenavel: true,
        exportavel: true,
        ocultavel: false,
        celula: (tr) => tr.funcionarioNome,
      },
      {
        id: 'tipo',
        titulo: titulo('tipo'),
        ordenavel: true,
        exportavel: true,
        celula: (tr) => tr.tipoNome,
      },
      {
        id: 'dataRealizacao',
        titulo: titulo('dataRealizacao'),
        ordenavel: true,
        exportavel: true,
        celula: (tr) => formatarData(tr.dataRealizacao),
      },
      {
        id: 'dataVencimento',
        titulo: titulo('dataVencimento'),
        ordenavel: true,
        exportavel: true,
        celula: (tr) => formatarData(tr.dataVencimento),
      },
      { id: 'instituicao', titulo: titulo('instituicao'), ordenavel: true, exportavel: true },
      {
        id: 'status',
        titulo: titulo('status'),
        ordenavel: true,
        exportavel: true,
        celula: (tr) => <StatusTreinamento status={tr.status} />,
      },
    ];
  }, [t]);

  const status = useMemo<FiltroStatus>(
    () => ({
      rotuloTodos: t('treinamentos.todos'),
      opcoes: TREINAMENTO_STATUS.map((valor) => ({
        valor,
        rotulo: t(`treinamentos.status.${valor}`),
      })),
    }),
    [t],
  );

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo={t('treinamentos.titulo')}
        descricao={t('treinamentos.descricao')}
        acoes={
          <SePermitido permissao="regulatorio-qualidade.treinamentos.criar">
            <Button type="button" variant="outline" onClick={() => setModal('tipo')}>
              <TagIcon aria-hidden />
              {t('treinamentos.novoTipo')}
            </Button>
            <Button type="button" onClick={() => setModal('treinamento')}>
              <PlusIcon aria-hidden />
              {t('treinamentos.novo')}
            </Button>
          </SePermitido>
        }
      />
      <DataGrid
        url={URL_TREINAMENTOS}
        schema={treinamentoPageSchema}
        querySchema={listTreinamentosQuerySchema}
        colunas={colunas}
        busca={t('treinamentos.buscar')}
        status={status}
        exportacao={EXPORTACAO}
        mensagemVazio={t('treinamentos.vazio')}
      />
      {modal === 'tipo' && <ModalTipoTreinamento onFechar={() => setModal(null)} />}
      {modal === 'treinamento' && <ModalTreinamento onFechar={() => setModal(null)} />}
    </div>
  );
}
