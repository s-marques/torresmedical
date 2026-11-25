import {
  listModelosQuerySchema,
  MODELO_PROFISSOES,
  modeloProntuarioPageSchema,
  type ModeloProntuario,
} from '@torres/shared';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, FiltroGrid } from '@/components/shared/data-grid/tipos';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { usePermissao } from '@/lib/auth/use-sessao';
import { ModalModelo } from './ModalModelo';
import { URL_MODELOS, useExcluirModelo } from './use-modelos-prontuario';

const PERMISSAO_PADRAO = 'consultorio-assistencial.modelos-prontuario.gerir' as const;

/**
 * Modelos de prontuário por profissão e especialidade (issue #152). O profissional cria e altera
 * os dele; os modelos padrão da clínica só quem tem a permissão de gerência.
 */
export function AbaModelos() {
  const { t } = useTranslation();
  const podeGerirPadrao = usePermissao(PERMISSAO_PADRAO);
  const [criando, setCriando] = useState<'proprio' | 'padrao' | null>(null);
  const [editando, setEditando] = useState<ModeloProntuario | null>(null);
  const [excluindo, setExcluindo] = useState<ModeloProntuario | null>(null);
  const excluir = useExcluirModelo();

  const colunas = useMemo<ColunaGrid<ModeloProntuario>[]>(
    () => [
      {
        id: 'nome',
        titulo: t('modelosProntuario.colunas.nome'),
        ordenavel: true,
        ocultavel: false,
      },
      {
        id: 'profissao',
        titulo: t('modelosProntuario.colunas.profissao'),
        ordenavel: true,
        celula: (m) => t(`modelosProntuario.profissoes.${m.profissao}`),
      },
      {
        id: 'especialidade',
        titulo: t('modelosProntuario.colunas.especialidade'),
        celula: (m) => m.especialidade ?? '-',
      },
      {
        id: 'tipo',
        titulo: t('modelosProntuario.colunas.tipo'),
        celula: (m) =>
          m.padrao
            ? t('modelosProntuario.tipoPadrao')
            : t('modelosProntuario.tipoProprio', { nome: m.profissionalNome ?? '-' }),
      },
      {
        id: 'versao',
        titulo: t('modelosProntuario.colunas.versao'),
        celula: (m) => `v${m.versao}`,
      },
      {
        id: 'status',
        titulo: t('modelosProntuario.colunas.status'),
        celula: (m) => (
          <StatusBadge tom={m.ativo ? 'sucesso' : 'neutro'}>
            {t(m.ativo ? 'modelosProntuario.status.ativo' : 'modelosProntuario.status.inativo')}
          </StatusBadge>
        ),
      },
    ],
    [t],
  );

  const filtros = useMemo<readonly FiltroGrid[]>(
    () => [
      {
        tipo: 'select',
        parametro: 'profissao',
        rotulo: t('modelosProntuario.filtros.profissao'),
        rotuloTodos: t('modelosProntuario.filtros.todasProfissoes'),
        opcoes: MODELO_PROFISSOES.map((valor) => ({
          valor,
          rotulo: t(`modelosProntuario.profissoes.${valor}`),
        })),
      },
      {
        tipo: 'select',
        parametro: 'tipo',
        rotulo: t('modelosProntuario.filtros.tipo'),
        rotuloTodos: t('modelosProntuario.filtros.todosTipos'),
        opcoes: [
          { valor: 'PADRAO', rotulo: t('modelosProntuario.filtros.padrao') },
          { valor: 'PROPRIO', rotulo: t('modelosProntuario.filtros.proprio') },
        ],
      },
    ],
    [t],
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-medium">{t('modelosProntuario.titulo')}</h2>
          <p className="text-sm text-muted-foreground">{t('modelosProntuario.descricao')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SePermitido permissao="consultorio-assistencial.prontuarios.criar">
            <Button type="button" onClick={() => setCriando('proprio')}>
              <PlusIcon aria-hidden />
              {t('modelosProntuario.novo')}
            </Button>
          </SePermitido>
          <SePermitido permissao={PERMISSAO_PADRAO}>
            <Button type="button" variant="outline" onClick={() => setCriando('padrao')}>
              <PlusIcon aria-hidden />
              {t('modelosProntuario.novoPadrao')}
            </Button>
          </SePermitido>
        </div>
      </div>
      <DataGrid
        url={URL_MODELOS}
        schema={modeloProntuarioPageSchema}
        querySchema={listModelosQuerySchema}
        colunas={colunas}
        busca={t('modelosProntuario.busca')}
        filtros={filtros}
        mensagemVazio={t('modelosProntuario.vazio')}
        acoes={(modelo) => [
          {
            rotulo: t('modelosProntuario.acoes.editar'),
            icone: PencilIcon,
            permissao: modelo.padrao
              ? PERMISSAO_PADRAO
              : 'consultorio-assistencial.prontuarios.editar',
            onSelect: () => setEditando(modelo),
          },
          {
            rotulo: t('modelosProntuario.acoes.excluir'),
            icone: Trash2Icon,
            destrutiva: true,
            permissao: modelo.padrao
              ? PERMISSAO_PADRAO
              : 'consultorio-assistencial.prontuarios.excluir',
            onSelect: () => setExcluindo(modelo),
          },
        ]}
      />
      {criando && (
        <ModalModelo
          key={criando}
          padrao={criando === 'padrao' && podeGerirPadrao}
          onFechar={() => setCriando(null)}
        />
      )}
      {editando && (
        <ModalModelo
          modelo={editando}
          padrao={editando.padrao}
          onFechar={() => setEditando(null)}
        />
      )}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo={t('modelosProntuario.excluir.titulo')}
        descricao={t('modelosProntuario.excluir.descricao', { nome: excluindo?.nome ?? '' })}
        rotuloConfirmar={t('modelosProntuario.acoes.excluir')}
        onConfirmar={() =>
          excluindo
            ? excluir.mutateAsync({ id: excluindo.id, padrao: excluindo.padrao })
            : undefined
        }
      />
    </div>
  );
}
