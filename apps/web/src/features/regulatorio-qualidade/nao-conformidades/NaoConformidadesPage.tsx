import {
  exportNaoConformidadesQuerySchema,
  listNaoConformidadesQuerySchema,
  NAO_CONFORMIDADE_STATUS,
  naoConformidadePageSchema,
  type NaoConformidade,
} from '@torres/shared';
import { PlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, ExportacaoGrid, FiltroStatus } from '@/components/shared/data-grid/tipos';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { formatarData } from '@/lib/formatar';
import { ModalNaoConformidade } from './ModalNaoConformidade';
import { StatusNaoConformidade } from './StatusNaoConformidade';
import { URL_NAO_CONFORMIDADES } from './use-nao-conformidades';

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'regulatorio-qualidade.nao-conformidades.exportar',
  nomeArquivo: 'nao-conformidades',
  schema: exportNaoConformidadesQuerySchema,
};

/**
 * Não Conformidades (`/nao-conformidades`,
 * docs/inventario/telas/regulatorio-qualidade-nao-conformidades.md): registro e acompanhamento de
 * não conformidades e ações corretivas, com as abas Todas, Aberta, Em Tratamento, Corrigida e Fechada.
 */
export default function NaoConformidadesPage() {
  const { t } = useTranslation();
  const [novaAberta, setNovaAberta] = useState(false);

  const colunas = useMemo<ColunaGrid<NaoConformidade>[]>(() => {
    const titulo = (chave: string) => t(`naoConformidades.colunas.${chave}`);
    return [
      {
        id: 'titulo',
        titulo: titulo('titulo'),
        ordenavel: true,
        exportavel: true,
        ocultavel: false,
      },
      { id: 'setor', titulo: titulo('setor'), ordenavel: true, exportavel: true },
      {
        id: 'tipo',
        titulo: titulo('tipo'),
        ordenavel: true,
        exportavel: true,
        celula: (nc) => t(`naoConformidades.tipos.${nc.tipo}`),
      },
      {
        id: 'dataOcorrencia',
        titulo: titulo('dataOcorrencia'),
        ordenavel: true,
        exportavel: true,
        celula: (nc) => formatarData(nc.dataOcorrencia),
      },
      { id: 'responsavel', titulo: titulo('responsavel'), ordenavel: true, exportavel: true },
      {
        id: 'status',
        titulo: titulo('status'),
        ordenavel: true,
        exportavel: true,
        celula: (nc) => <StatusNaoConformidade status={nc.status} />,
      },
    ];
  }, [t]);

  const status = useMemo<FiltroStatus>(
    () => ({
      rotuloTodos: t('naoConformidades.todas'),
      opcoes: NAO_CONFORMIDADE_STATUS.map((valor) => ({
        valor,
        rotulo: t(`naoConformidades.status.${valor}`),
      })),
    }),
    [t],
  );

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo={t('naoConformidades.titulo')}
        descricao={t('naoConformidades.descricao')}
        acoes={
          <SePermitido permissao="regulatorio-qualidade.nao-conformidades.criar">
            <Button type="button" onClick={() => setNovaAberta(true)}>
              <PlusIcon aria-hidden />
              {t('naoConformidades.nova')}
            </Button>
          </SePermitido>
        }
      />
      <DataGrid
        url={URL_NAO_CONFORMIDADES}
        schema={naoConformidadePageSchema}
        querySchema={listNaoConformidadesQuerySchema}
        colunas={colunas}
        busca={t('naoConformidades.buscar')}
        status={status}
        exportacao={EXPORTACAO}
        mensagemVazio={t('naoConformidades.vazio')}
      />
      {novaAberta && <ModalNaoConformidade onFechar={() => setNovaAberta(false)} />}
    </div>
  );
}
