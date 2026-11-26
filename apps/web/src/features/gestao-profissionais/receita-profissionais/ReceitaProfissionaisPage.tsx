import {
  exportReceitaProfissionaisQuerySchema,
  listReceitaProfissionaisQuerySchema,
  receitaProfissionalPageSchema,
  resumoReceitaProfissionaisQuerySchema,
  statusExibicaoContaReceber,
  type ReceitaProfissional,
} from '@torres/shared';
import { PencilIcon, SearchIcon, Trash2Icon, Undo2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type {
  AcaoLinha,
  ColunaGrid,
  ExportacaoGrid,
  FiltroGrid,
} from '@/components/shared/data-grid/tipos';
import { PageHeader } from '@/components/shared/PageHeader';
import { formatarData } from '@/lib/formatar';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { StatusContaFinanceira } from '../../financeiro/contas-financeiras/StatusContaFinanceira';
import { DetalheReceita } from './DetalheReceita';
import { ModalReceita } from './ModalReceita';
import { ResumoReceitas } from './ResumoReceitas';
import { useRotulosStatusReceita } from './rotulos-status';
import {
  PARAMETROS_FILTRO_RECEITAS,
  URL_RECEITA_PROFISSIONAIS,
  useEstornarBaixaReceita,
  useExcluirReceita,
} from './use-receita-profissionais';

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'gestao-profissionais.receita-profissionais.exportar',
  nomeArquivo: 'receita-profissionais',
  schema: exportReceitaProfissionaisQuerySchema,
};

/** Filtros da URL que valem para os cards de totais (só os aceitos pela API). */
function useFiltrosResumo(): Record<string, string> {
  const [params] = useSearchParams();
  return useMemo(() => {
    const filtros = Object.fromEntries(
      PARAMETROS_FILTRO_RECEITAS.flatMap((chave) => {
        const valor = params.get(chave)?.trim();
        return valor ? [[chave, valor]] : [];
      }),
    );
    return resumoReceitaProfissionaisQuerySchema.safeParse(filtros).success ? filtros : {};
  }, [params]);
}

/**
 * Receita Profissionais (`/receita-profissionais`,
 * docs/inventario/telas/gestao-profissionais-receita-profissionais.md): receitas recebidas pelos
 * profissionais, com totais, resumo por profissional e grid filtrável.
 */
export default function ReceitaProfissionaisPage() {
  const { t } = useTranslation();
  const rotulosStatus = useRotulosStatusReceita();
  const filtrosResumo = useFiltrosResumo();
  const [detalhando, setDetalhando] = useState<ReceitaProfissional | null>(null);
  const [editando, setEditando] = useState<ReceitaProfissional | null>(null);
  const [estornando, setEstornando] = useState<ReceitaProfissional | null>(null);
  const [excluindo, setExcluindo] = useState<ReceitaProfissional | null>(null);
  const estornar = useEstornarBaixaReceita();
  const excluir = useExcluirReceita();

  const colunas = useMemo<ColunaGrid<ReceitaProfissional>[]>(
    () => [
      {
        id: 'dataVencimento',
        titulo: t('receitaProfissionais.colunas.data'),
        ordenavel: true,
        exportavel: true,
        celula: (r) => formatarData(r.dataVencimento),
      },
      {
        id: 'profissional',
        titulo: t('receitaProfissionais.colunas.profissional'),
        ordenavel: true,
        exportavel: true,
        celula: (r) => r.profissionalNome,
      },
      {
        id: 'paciente',
        titulo: t('receitaProfissionais.colunas.paciente'),
        ordenavel: true,
        exportavel: true,
        celula: (r) => r.pacienteNome ?? '-',
      },
      {
        id: 'descricao',
        titulo: t('receitaProfissionais.colunas.descricao'),
        exportavel: true,
        className: 'max-w-64 truncate',
      },
      {
        id: 'formaPagamento',
        titulo: t('receitaProfissionais.colunas.formaPagamento'),
        exportavel: true,
        celula: (r) => r.formaPagamentoNome ?? '-',
      },
      {
        id: 'valor',
        titulo: t('receitaProfissionais.colunas.valor'),
        ordenavel: true,
        exportavel: true,
        celula: (r) => formatarMoeda(Number(r.valor)),
      },
      {
        id: 'status',
        titulo: t('receitaProfissionais.colunas.status'),
        exportavel: true,
        celula: (r) => (
          <StatusContaFinanceira status={statusExibicaoContaReceber(r)} rotulos={rotulosStatus} />
        ),
      },
    ],
    [t, rotulosStatus],
  );

  const filtros = useMemo<FiltroGrid[]>(
    () => [
      {
        tipo: 'entidade',
        parametro: 'profissionalId',
        rotulo: t('receitaProfissionais.profissional'),
        entidade: 'profissionais',
        rotuloTodos: t('comum.todos'),
      },
      {
        tipo: 'select',
        parametro: 'status',
        rotulo: t('receitaProfissionais.colunas.status'),
        opcoes: (['PENDENTE', 'RECEBIDO', 'VENCIDO'] as const).map((valor) => ({
          valor,
          rotulo: rotulosStatus[valor === 'PENDENTE' ? 'A_VENCER' : valor],
        })),
      },
      {
        tipo: 'entidade',
        parametro: 'formaPagamentoId',
        rotulo: t('receitaProfissionais.formaPagamento'),
        entidade: 'formas-pagamento',
        filtros: { finalidade: 'receber' },
        rotuloTodos: t('receitaProfissionais.todasFormas'),
      },
      {
        tipo: 'periodo',
        rotulo: t('receitaProfissionais.periodo'),
        parametroDe: 'vencimentoDe',
        parametroAte: 'vencimentoAte',
      },
    ],
    [t, rotulosStatus],
  );

  const acoes = (receita: ReceitaProfissional): AcaoLinha[] => [
    {
      rotulo: t('receitaProfissionais.acoes.detalhar'),
      icone: SearchIcon,
      onSelect: () => setDetalhando(receita),
    },
    ...(receita.status === 'RECEBIDO'
      ? [
          {
            rotulo: t('receitaProfissionais.acoes.estornarBaixa'),
            icone: Undo2Icon,
            permissao: 'gestao-profissionais.receita-profissionais.editar' as const,
            onSelect: () => setEstornando(receita),
          },
        ]
      : []),
    {
      rotulo: t('receitaProfissionais.acoes.editar'),
      icone: PencilIcon,
      permissao: 'gestao-profissionais.receita-profissionais.editar',
      onSelect: () => setEditando(receita),
    },
    {
      rotulo: t('receitaProfissionais.acoes.excluir'),
      icone: Trash2Icon,
      destrutiva: true,
      permissao: 'gestao-profissionais.receita-profissionais.excluir',
      onSelect: () => setExcluindo(receita),
    },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader titulo={t('receitaProfissionais.titulo')} />
      <ResumoReceitas filtros={filtrosResumo} />
      <DataGrid
        url={URL_RECEITA_PROFISSIONAIS}
        schema={receitaProfissionalPageSchema}
        querySchema={listReceitaProfissionaisQuerySchema}
        colunas={colunas}
        busca={t('receitaProfissionais.buscar')}
        filtros={filtros}
        exportacao={EXPORTACAO}
        acoes={acoes}
        aoClicarLinha={setDetalhando}
        mensagemVazio={t('receitaProfissionais.vazio')}
      />
      {editando && <ModalReceita receita={editando} onFechar={() => setEditando(null)} />}
      {detalhando && (
        <DetalheReceita
          receita={detalhando}
          onFechar={() => setDetalhando(null)}
          onEditar={() => {
            setEditando(detalhando);
            setDetalhando(null);
          }}
        />
      )}
      <ConfirmDialog
        aberto={estornando !== null}
        onAbertoChange={(aberto) => aberto || setEstornando(null)}
        titulo={t('receitaProfissionais.estornarTitulo')}
        descricao={t('receitaProfissionais.estornarDescricao', {
          descricao: estornando?.descricao ?? '',
        })}
        rotuloConfirmar={t('receitaProfissionais.acoes.estornarBaixa')}
        onConfirmar={() => (estornando ? estornar.mutateAsync(estornando.id) : undefined)}
      />
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo={t('receitaProfissionais.excluirTitulo')}
        descricao={t('receitaProfissionais.excluirDescricao', {
          descricao: excluindo?.descricao ?? '',
        })}
        rotuloConfirmar={t('receitaProfissionais.acoes.excluir')}
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
