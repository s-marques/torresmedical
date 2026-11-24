import {
  CLASSIFICACOES_PARCEIRO,
  exportProfissionaisQuerySchema,
  listProfissionaisQuerySchema,
  profissionalPageSchema,
  type Profissional,
} from '@torres/shared';
import {
  CalendarCogIcon,
  LockIcon,
  PencilIcon,
  PlusIcon,
  PowerIcon,
  StethoscopeIcon,
  Trash2Icon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type {
  AcaoLinha,
  ColunaGrid,
  ExportacaoGrid,
  FiltroGrid,
  FiltroStatus,
} from '@/components/shared/data-grid/tipos';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusAtivo } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { formatarMascara } from '@/lib/forms/mascaras';
import { AvatarProfissional } from './AvatarProfissional';
import { ClassificacaoBadge } from './ClassificacaoBadge';
import { DetalheProfissional } from './DetalheProfissional';
import { formatarValor } from './formatadores';
import { ModalBloqueios } from './ModalBloqueios';
import { ModalEspecialidades } from './ModalEspecialidades';
import { ModalProfissional } from './ModalProfissional';
import {
  URL_PROFISSIONAIS,
  useAlterarStatusProfissional,
  useExcluirProfissional,
} from './use-profissionais';

const STATUS: FiltroStatus = {
  opcoes: [
    { valor: 'ativo', rotulo: 'Ativo' },
    { valor: 'inativo', rotulo: 'Inativo' },
  ],
};

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'gestao-profissionais.profissionais.exportar',
  nomeArquivo: 'profissionais',
  schema: exportProfissionaisQuerySchema,
};

const BREADCRUMB = [
  { rotulo: 'Painel', para: '/' },
  { rotulo: 'Gestão Profissionais' },
  { rotulo: 'Profissionais' },
];

const COLUNAS: ColunaGrid<Profissional>[] = [
  {
    id: 'nome',
    titulo: 'Nome',
    ordenavel: true,
    exportavel: true,
    ocultavel: false,
    celula: (p) => (
      <div className="flex items-center gap-3">
        <AvatarProfissional profissional={p} />
        <span className="font-medium">{p.nome}</span>
      </div>
    ),
  },
  {
    id: 'registro',
    titulo: 'Registro',
    ordenavel: true,
    exportavel: true,
    celula: (p) => <span className="font-mono text-xs">{p.registro ?? '-'}</span>,
  },
  {
    id: 'telefone',
    titulo: 'Telefone',
    ordenavel: true,
    exportavel: true,
    celula: (p) => (p.telefone ? formatarMascara('telefone', p.telefone) : '-'),
  },
  { id: 'email', titulo: 'Email', ordenavel: true, exportavel: true },
  {
    id: 'duracaoPadrao',
    titulo: 'Duração',
    ordenavel: true,
    exportavel: true,
    celula: (p) => `${p.duracaoPadrao} min`,
  },
  {
    id: 'valorConsulta',
    titulo: 'Consulta',
    ordenavel: true,
    exportavel: true,
    celula: (p) => formatarValor(p.valorConsulta),
  },
  {
    id: 'ativo',
    titulo: 'Status',
    ordenavel: true,
    exportavel: true,
    celula: (p) => <StatusAtivo ativo={p.ativo} />,
  },
];

/**
 * Profissionais (`/profissionais`, docs/inventario/telas/gestao-profissionais-profissionais.md):
 * médicos, dentistas e outros profissionais. Clicar na linha abre o detalhe.
 */
export default function ProfissionaisPage() {
  const { t } = useTranslation();
  const [criando, setCriando] = useState(false);
  const [detalhando, setDetalhando] = useState<Profissional | null>(null);
  const [editando, setEditando] = useState<Profissional | null>(null);
  const [bloqueando, setBloqueando] = useState<Profissional | null>(null);
  const [desativando, setDesativando] = useState<Profissional | null>(null);
  const [excluindo, setExcluindo] = useState<Profissional | null>(null);
  const [especialidades, setEspecialidades] = useState(false);
  const alterarStatus = useAlterarStatusProfissional();
  const excluir = useExcluirProfissional();

  // A classificação do parceiro (#143) entra antes da coluna Status.
  const colunas = useMemo((): ColunaGrid<Profissional>[] => {
    const classificacao: ColunaGrid<Profissional> = {
      id: 'classificacao',
      titulo: t('classificacao.coluna'),
      ordenavel: true,
      celula: (p) => <ClassificacaoBadge classificacao={p.classificacao} />,
    };
    return [...COLUNAS.slice(0, -1), classificacao, ...COLUNAS.slice(-1)];
  }, [t]);
  const filtros = useMemo(
    (): readonly FiltroGrid[] => [
      {
        tipo: 'select',
        parametro: 'classificacao',
        rotulo: t('classificacao.filtro.rotulo'),
        rotuloTodos: t('classificacao.filtro.todas'),
        opcoes: CLASSIFICACOES_PARCEIRO.map((valor) => ({
          valor,
          rotulo: t(`classificacao.rotulos.${valor}`),
        })),
      },
    ],
    [t],
  );

  const acoes = (profissional: Profissional): AcaoLinha[] => [
    {
      rotulo: 'Editar',
      icone: PencilIcon,
      permissao: 'gestao-profissionais.profissionais.editar',
      onSelect: () => setEditando(profissional),
    },
    {
      rotulo: 'Bloqueios de Agenda',
      icone: LockIcon,
      permissao: 'gestao-profissionais.profissionais.editar',
      onSelect: () => setBloqueando(profissional),
    },
    {
      rotulo: profissional.ativo ? 'Desativar' : 'Ativar',
      icone: PowerIcon,
      permissao: 'gestao-profissionais.profissionais.editar',
      onSelect: () =>
        profissional.ativo
          ? setDesativando(profissional)
          : void alterarStatus.mutateAsync({ id: profissional.id, ativo: true }),
    },
    {
      rotulo: 'Excluir',
      icone: Trash2Icon,
      destrutiva: true,
      permissao: 'gestao-profissionais.profissionais.excluir',
      onSelect: () => setExcluindo(profissional),
    },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Profissionais"
        descricao="Gerencie médicos, dentistas e outros profissionais."
        breadcrumb={BREADCRUMB}
        acoes={
          <>
            <SePermitido permissao="gestao-profissionais.profissionais.ver">
              <Button type="button" variant="outline" onClick={() => setEspecialidades(true)}>
                <StethoscopeIcon aria-hidden />
                Especialidades
              </Button>
            </SePermitido>
            <SePermitido permissao="configuracoes-gestao.tipos-agendamento.ver">
              <Button asChild variant="outline">
                <Link to="/config/tipos-agendamento">
                  <CalendarCogIcon aria-hidden />
                  Tipos de Agendamento
                </Link>
              </Button>
            </SePermitido>
            <SePermitido permissao="gestao-profissionais.profissionais.criar">
              <Button type="button" onClick={() => setCriando(true)}>
                <PlusIcon aria-hidden />
                Novo Profissional
              </Button>
            </SePermitido>
          </>
        }
      />
      <DataGrid
        url={URL_PROFISSIONAIS}
        schema={profissionalPageSchema}
        querySchema={listProfissionaisQuerySchema}
        colunas={colunas}
        filtros={filtros}
        busca="Buscar profissionais..."
        status={STATUS}
        exportacao={EXPORTACAO}
        acoes={acoes}
        aoClicarLinha={setDetalhando}
        mensagemVazio="Nenhum profissional encontrado."
      />
      {criando && <ModalProfissional onFechar={() => setCriando(false)} />}
      {editando && <ModalProfissional profissional={editando} onFechar={() => setEditando(null)} />}
      {detalhando && (
        <DetalheProfissional
          profissional={detalhando}
          onFechar={() => setDetalhando(null)}
          onEditar={() => {
            setEditando(detalhando);
            setDetalhando(null);
          }}
        />
      )}
      {bloqueando && (
        <ModalBloqueios profissional={bloqueando} onFechar={() => setBloqueando(null)} />
      )}
      {especialidades && <ModalEspecialidades onFechar={() => setEspecialidades(false)} />}
      <ConfirmDialog
        aberto={desativando !== null}
        onAbertoChange={(aberto) => aberto || setDesativando(null)}
        titulo="Desativar Profissional"
        descricao={`Desativar o profissional "${desativando?.nome ?? ''}"? Ele deixa de aparecer nas seleções, e o cadastro continua na lista como Inativo.`}
        rotuloConfirmar="Desativar"
        onConfirmar={() =>
          desativando ? alterarStatus.mutateAsync({ id: desativando.id, ativo: false }) : undefined
        }
      />
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir Profissional"
        descricao={`Tem certeza que deseja excluir o profissional "${excluindo?.nome ?? ''}"? Esta ação não pode ser desfeita.`}
        rotuloConfirmar="Excluir"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
