import {
  ENCAMINHAMENTO_SITUACOES,
  encaminhamentoPageSchema,
  exportEncaminhamentosQuerySchema,
  listEncaminhamentosQuerySchema,
  type Encaminhamento,
  type EncaminhamentoSituacao,
} from '@torres/shared';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type {
  ColunaGrid,
  ExportacaoGrid,
  FiltroGrid,
  FiltroStatus,
} from '@/components/shared/data-grid/tipos';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatarData } from '@/lib/formatar';
import { AbaRelatorio } from './AbaRelatorio';
import { ModalEncaminhamento } from './ModalEncaminhamento';
import { URL_ENCAMINHAMENTOS, useExcluirEncaminhamento } from './use-encaminhamentos';

type Aba = 'lista' | 'relatorio';

const PARAMETRO_ABA = 'aba';

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'consultorio-assistencial.encaminhamentos.exportar',
  nomeArquivo: 'encaminhamentos',
  schema: exportEncaminhamentosQuerySchema,
};

const TOM_SITUACAO: Readonly<Record<EncaminhamentoSituacao, TomStatus>> = {
  ENCAMINHADO: 'info',
  AGENDADO: 'alerta',
  ATENDIDO: 'sucesso',
};

/**
 * Encaminhamentos (`/encaminhamentos`, issue #146, R §26): pacientes encaminhados entre
 * profissionais, para medir o ecossistema Torres. Tela fora do inventário, criada a partir dos
 * requisitos do cliente. O destino vê só o nome do paciente, sem dado clínico (R §14).
 *
 * A aba fica na URL; ao trocar de aba, busca, filtros e ordenação da outra são descartados (os
 * grids guardam o estado na URL).
 */
export default function EncaminhamentosPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const aba: Aba = params.get(PARAMETRO_ABA) === 'relatorio' ? 'relatorio' : 'lista';
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Encaminhamento | null>(null);
  const [excluindo, setExcluindo] = useState<Encaminhamento | null>(null);
  const excluir = useExcluirEncaminhamento();

  const trocarAba = (valor: string) => {
    setParams(valor === 'relatorio' ? { [PARAMETRO_ABA]: valor } : {}, { replace: true });
  };

  const status = useMemo<FiltroStatus>(
    () => ({
      parametro: 'situacao',
      opcoes: ENCAMINHAMENTO_SITUACOES.map((valor) => ({
        valor,
        rotulo: t(`encaminhamentos.situacoes.${valor}`),
      })),
    }),
    [t],
  );

  const filtros = useMemo<readonly FiltroGrid[]>(
    () => [
      {
        tipo: 'periodo',
        rotulo: t('encaminhamentos.periodo'),
        parametroDe: 'de',
        parametroAte: 'ate',
      },
    ],
    [t],
  );

  const colunas = useMemo<ColunaGrid<Encaminhamento>[]>(() => {
    const titulo = (chave: string) => t(`encaminhamentos.colunas.${chave}`);
    return [
      {
        id: 'data',
        titulo: titulo('data'),
        ordenavel: true,
        exportavel: true,
        celula: (e) => formatarData(e.data),
      },
      {
        id: 'paciente',
        titulo: titulo('paciente'),
        ordenavel: true,
        exportavel: true,
        celula: (e) => e.pacienteNome ?? '-',
      },
      {
        id: 'origem',
        titulo: titulo('origem'),
        ordenavel: true,
        exportavel: true,
        celula: (e) => e.origemProfissionalNome ?? '-',
      },
      {
        id: 'destino',
        titulo: titulo('destino'),
        ordenavel: true,
        exportavel: true,
        celula: (e) => e.destinoProfissionalNome ?? '-',
      },
      {
        id: 'especialidade',
        titulo: titulo('especialidade'),
        ordenavel: true,
        exportavel: true,
        celula: (e) => e.especialidadeNome ?? '-',
      },
      {
        id: 'situacao',
        titulo: titulo('situacao'),
        ordenavel: true,
        exportavel: true,
        celula: (e) => (
          <StatusBadge tom={TOM_SITUACAO[e.situacao]}>
            {t(`encaminhamentos.situacoes.${e.situacao}`)}
          </StatusBadge>
        ),
      },
    ];
  }, [t]);

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo={t('encaminhamentos.titulo')}
        descricao={t('encaminhamentos.descricao')}
        acoes={
          <SePermitido permissao="consultorio-assistencial.encaminhamentos.criar">
            <Button type="button" onClick={() => setCriando(true)}>
              <PlusIcon aria-hidden />
              {t('encaminhamentos.novo')}
            </Button>
          </SePermitido>
        }
      />
      <Tabs value={aba} onValueChange={trocarAba}>
        <TabsList>
          <TabsTrigger value="lista">{t('encaminhamentos.abas.lista')}</TabsTrigger>
          <TabsTrigger value="relatorio">{t('encaminhamentos.abas.relatorio')}</TabsTrigger>
        </TabsList>
        <TabsContent value="lista" className="mt-4">
          <DataGrid
            url={URL_ENCAMINHAMENTOS}
            schema={encaminhamentoPageSchema}
            querySchema={listEncaminhamentosQuerySchema}
            colunas={colunas}
            busca={t('encaminhamentos.buscar')}
            status={status}
            filtros={filtros}
            exportacao={EXPORTACAO}
            mensagemVazio={t('encaminhamentos.vazio')}
            acoes={(encaminhamento) => [
              {
                rotulo: t('encaminhamentos.acoes.editar'),
                icone: PencilIcon,
                permissao: 'consultorio-assistencial.encaminhamentos.editar',
                onSelect: () => setEditando(encaminhamento),
              },
              {
                rotulo: t('encaminhamentos.acoes.excluir'),
                icone: Trash2Icon,
                destrutiva: true,
                permissao: 'consultorio-assistencial.encaminhamentos.excluir',
                onSelect: () => setExcluindo(encaminhamento),
              },
            ]}
          />
        </TabsContent>
        <TabsContent value="relatorio" className="mt-4">
          <AbaRelatorio />
        </TabsContent>
      </Tabs>
      {criando && <ModalEncaminhamento onFechar={() => setCriando(false)} />}
      {editando && (
        <ModalEncaminhamento encaminhamento={editando} onFechar={() => setEditando(null)} />
      )}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo={t('encaminhamentos.excluir.titulo')}
        descricao={t('encaminhamentos.excluir.descricao', {
          paciente: excluindo?.pacienteNome ?? '',
        })}
        rotuloConfirmar={t('encaminhamentos.excluir.confirmar')}
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
