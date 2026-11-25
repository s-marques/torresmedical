import {
  exportacaoLotePageSchema,
  EXPORTACAO_LOTE_STATUS,
  listExportacoesLoteQuerySchema,
  type ExportacaoLote,
  type ExportacaoLoteEntidade,
  type ExportacaoLoteStatus,
} from '@torres/shared';
import { DatabaseIcon, DownloadIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, FiltroStatus } from '@/components/shared/data-grid/tipos';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { baixarArquivo } from '@/lib/api/download';
import { formatarDataHora } from '@/lib/formatar';
import {
  URL_EXPORTACOES_LOTE,
  useEntidadesExportacaoLote,
  useSolicitarExportacaoLote,
} from './use-exportacao-lote';

/** Atualiza a lista enquanto o ZIP é gerado em segundo plano. */
const ATUALIZACAO_MS = 5000;

const TOM: Readonly<Record<ExportacaoLoteStatus, TomStatus>> = {
  PENDENTE: 'neutro',
  PROCESSANDO: 'info',
  CONCLUIDA: 'sucesso',
  FALHOU: 'perigo',
};

function tamanhoLegivel(bytes: number | null): string {
  if (bytes === null) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Aba "Exportação de dados" (issue #158, R §39): pede o ZIP completo de uma entidade (CSV e
 * arquivos), acompanha a geração em segundo plano e baixa o arquivo pronto (vale por 24 h).
 */
export function AbaExportacaoDados() {
  const { t } = useTranslation();
  const entidades = useEntidadesExportacaoLote();
  const solicitar = useSolicitarExportacaoLote();
  const [entidade, setEntidade] = useState<ExportacaoLoteEntidade | ''>('');
  const [incluirArquivos, setIncluirArquivos] = useState(true);
  const selecionada = entidades.data?.find((e) => e.id === entidade);

  const status: FiltroStatus = {
    opcoes: EXPORTACAO_LOTE_STATUS.map((valor) => ({
      valor,
      rotulo: t(`exportacaoLote.status.${valor}`),
    })),
  };
  const colunas: ColunaGrid<ExportacaoLote>[] = [
    {
      id: 'entidade',
      titulo: t('exportacaoLote.colunas.entidade'),
      ordenavel: true,
      ocultavel: false,
      celula: (e) => t(`exportacaoLote.entidades.${e.entidade}`),
    },
    {
      id: 'status',
      titulo: t('exportacaoLote.colunas.situacao'),
      ordenavel: true,
      celula: (e) => (
        <div className="grid gap-1">
          <StatusBadge tom={TOM[e.status]}>{t(`exportacaoLote.status.${e.status}`)}</StatusBadge>
          {e.erroCodigo && (
            <span className="text-xs text-destructive">
              {t(`exportacaoLote.erros.${e.erroCodigo}`, {
                defaultValue: t('exportacaoLote.erros.ERRO_PROCESSAMENTO'),
              })}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'solicitadaEm',
      titulo: t('exportacaoLote.colunas.solicitadaEm'),
      ordenavel: true,
      celula: (e) => formatarDataHora(e.solicitadaEm),
    },
    {
      id: 'tamanhoBytes',
      titulo: t('exportacaoLote.colunas.tamanho'),
      celula: (e) => tamanhoLegivel(e.tamanhoBytes),
    },
    {
      id: 'expiraEm',
      titulo: t('exportacaoLote.colunas.expiraEm'),
      celula: (e) => {
        if (e.status !== 'CONCLUIDA' || !e.expiraEm) return '-';
        return e.disponivel ? formatarDataHora(e.expiraEm) : t('exportacaoLote.expirada');
      },
    },
  ];

  return (
    <div className="grid gap-6 rounded-lg border p-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <DatabaseIcon aria-hidden className="size-5" />
          {t('exportacaoLote.titulo')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('exportacaoLote.descricao')}</p>
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-300" role="note">
          {t('exportacaoLote.aviso')}
        </p>
      </div>

      <SePermitido permissao="configuracoes-gestao.exportacao-lote.executar">
        {entidades.isError ? (
          <p className="text-sm text-destructive" role="alert">
            {t('exportacaoLote.erroCarregar')}
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-4">
            <div className="grid min-w-64 gap-2">
              <Label htmlFor="exportacao-entidade">{t('exportacaoLote.entidade')}</Label>
              <Select
                value={entidade}
                onValueChange={(valor) => setEntidade(valor as ExportacaoLoteEntidade)}
              >
                <SelectTrigger id="exportacao-entidade">
                  <SelectValue placeholder={t('exportacaoLote.selecione')} />
                </SelectTrigger>
                <SelectContent>
                  {entidades.data?.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {t(`exportacaoLote.entidades.${e.id}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selecionada?.comArquivos && (
              <div className="flex items-center gap-2 pb-2">
                <Checkbox
                  id="exportacao-arquivos"
                  checked={incluirArquivos}
                  onCheckedChange={(marcado) => setIncluirArquivos(marcado === true)}
                />
                <Label htmlFor="exportacao-arquivos">{t('exportacaoLote.incluirArquivos')}</Label>
              </div>
            )}
            <Button
              type="button"
              disabled={!entidade || solicitar.isPending}
              onClick={() => entidade && solicitar.mutate({ entidade, incluirArquivos })}
            >
              <DownloadIcon aria-hidden />
              {t('exportacaoLote.solicitar')}
            </Button>
          </div>
        )}
      </SePermitido>

      <div className="grid gap-2">
        <h3 className="font-medium">{t('exportacaoLote.historico')}</h3>
        <DataGrid
          url={URL_EXPORTACOES_LOTE}
          schema={exportacaoLotePageSchema}
          querySchema={listExportacoesLoteQuerySchema}
          colunas={colunas}
          busca={false}
          status={status}
          mensagemVazio={t('exportacaoLote.vazio')}
          atualizacaoMs={ATUALIZACAO_MS}
          acoes={(exportacao) =>
            exportacao.disponivel
              ? [
                  {
                    rotulo: t('exportacaoLote.baixar'),
                    icone: DownloadIcon,
                    permissao: 'configuracoes-gestao.exportacao-lote.ver',
                    onSelect: () =>
                      void baixarArquivo(
                        `${URL_EXPORTACOES_LOTE}/${exportacao.id}/download`,
                        undefined,
                        `exportacao-${exportacao.entidade}.zip`,
                      ),
                  },
                ]
              : []
          }
        />
      </div>
    </div>
  );
}
