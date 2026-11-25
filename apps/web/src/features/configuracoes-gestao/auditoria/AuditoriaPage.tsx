import {
  AUDIT_ACTIONS,
  AUDIT_GRUPOS,
  auditLogPageSchema,
  auditLogQuerySchema,
  exportAuditLogQuerySchema,
  type AuditLogItem,
} from '@torres/shared';
import { EyeIcon, LockIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type {
  ColunaGrid,
  ExportacaoGrid,
  FiltroGrid,
  FiltroStatus,
} from '@/components/shared/data-grid/tipos';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';
import { formatarDataHora } from '@/lib/formatar';
import { ModalDetalheAuditoria } from './ModalDetalheAuditoria';
import { useRotulosAuditoria } from './rotulos';
import { URL_AUDITORIA, useEntidadesAuditoria } from './use-auditoria';

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'configuracoes-gestao.auditoria.exportar',
  nomeArquivo: 'auditoria',
  schema: exportAuditLogQuerySchema,
};

const TOM_ACAO: Readonly<Record<AuditLogItem['action'], TomStatus>> = {
  CREATE: 'sucesso',
  UPDATE: 'info',
  DELETE: 'perigo',
  EXPORT: 'neutro',
};

/**
 * Auditoria (`/gestao/auditoria`, issue #155, R §15 e §41): consulta da trilha de tudo o que foi
 * feito no sistema (quem, o quê, quando, antes e depois). Tela fora do inventário, criada a
 * partir dos requisitos do cliente. Os atalhos (chips) filtram os eventos destacados no
 * requisito; o conteúdo clínico só aparece para quem pode ver o prontuário.
 */
export default function AuditoriaPage() {
  const { t } = useTranslation();
  const { rotuloAcao, rotuloEntidade } = useRotulosAuditoria();
  const [detalhe, setDetalhe] = useState<AuditLogItem | null>(null);
  const entidades = useEntidadesAuditoria();

  const status = useMemo<FiltroStatus>(
    () => ({
      parametro: 'grupo',
      opcoes: AUDIT_GRUPOS.map((valor) => ({ valor, rotulo: t(`auditoria.grupos.${valor}`) })),
    }),
    [t],
  );

  const nomesEntidades = entidades.data?.data;
  const filtros = useMemo<readonly FiltroGrid[]>(
    () => [
      {
        tipo: 'entidade',
        parametro: 'userId',
        rotulo: t('auditoria.filtros.usuario'),
        entidade: 'usuarios',
        rotuloTodos: t('auditoria.filtros.todosUsuarios'),
      },
      {
        tipo: 'select',
        parametro: 'entity',
        rotulo: t('auditoria.filtros.entidade'),
        rotuloTodos: t('auditoria.filtros.todasEntidades'),
        opcoes: (nomesEntidades ?? []).map((valor) => ({
          valor,
          rotulo: rotuloEntidade(valor),
        })),
      },
      {
        tipo: 'select',
        parametro: 'action',
        rotulo: t('auditoria.filtros.acao'),
        rotuloTodos: t('auditoria.filtros.todasAcoes'),
        opcoes: AUDIT_ACTIONS.map((valor) => ({ valor, rotulo: rotuloAcao(valor) })),
      },
      {
        tipo: 'texto',
        parametro: 'entityId',
        rotulo: t('auditoria.filtros.registro'),
        placeholder: t('auditoria.filtros.registroPlaceholder'),
      },
      {
        tipo: 'periodo',
        rotulo: t('auditoria.filtros.periodo'),
        parametroDe: 'de',
        parametroAte: 'ate',
      },
    ],
    [t, nomesEntidades, rotuloAcao, rotuloEntidade],
  );

  const colunas = useMemo<ColunaGrid<AuditLogItem>[]>(() => {
    const titulo = (chave: string) => t(`auditoria.colunas.${chave}`);
    return [
      {
        id: 'occurredAt',
        titulo: titulo('data'),
        ordenavel: true,
        exportavel: 'data',
        ocultavel: false,
        celula: (item) => formatarDataHora(item.occurredAt),
      },
      {
        id: 'usuario',
        titulo: titulo('usuario'),
        exportavel: true,
        celula: (item) => item.userNome ?? item.userId,
      },
      {
        id: 'action',
        titulo: titulo('acao'),
        ordenavel: true,
        exportavel: 'acao',
        celula: (item) => (
          <StatusBadge tom={TOM_ACAO[item.action]}>{rotuloAcao(item.action)}</StatusBadge>
        ),
      },
      {
        id: 'entity',
        titulo: titulo('entidade'),
        ordenavel: true,
        exportavel: 'entidade',
        celula: (item) => rotuloEntidade(item.entity),
      },
      {
        id: 'entityId',
        titulo: titulo('registro'),
        exportavel: 'registro',
        className: 'font-mono text-xs',
      },
      {
        id: 'campos',
        titulo: titulo('campos'),
        exportavel: true,
        celula: (item) =>
          item.restrito ? (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <LockIcon aria-hidden className="size-3.5" />
              {t('auditoria.restrito')}
            </span>
          ) : (
            item.campos.join(', ') || '-'
          ),
      },
    ];
  }, [t, rotuloAcao, rotuloEntidade]);

  return (
    <div className="grid gap-6">
      <PageHeader titulo={t('auditoria.titulo')} descricao={t('auditoria.descricao')} />
      <DataGrid
        url={URL_AUDITORIA}
        schema={auditLogPageSchema}
        querySchema={auditLogQuerySchema}
        colunas={colunas}
        busca={t('auditoria.buscar')}
        status={status}
        filtros={filtros}
        exportacao={EXPORTACAO}
        mensagemVazio={t('auditoria.vazio')}
        aoClicarLinha={setDetalhe}
        acoes={(item) => [
          {
            rotulo: t('auditoria.acoesLinha.detalhes'),
            icone: EyeIcon,
            onSelect: () => setDetalhe(item),
          },
        ]}
      />
      {detalhe && <ModalDetalheAuditoria item={detalhe} onFechar={() => setDetalhe(null)} />}
    </div>
  );
}
