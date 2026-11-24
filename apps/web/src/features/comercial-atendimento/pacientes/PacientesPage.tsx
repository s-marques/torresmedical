import {
  PACIENTE_CANAIS_ORIGEM,
  exportPacientesQuerySchema,
  listPacientesQuerySchema,
  pacientePageSchema,
  type PacienteResumo as Paciente,
} from '@torres/shared';
import type { TFunction } from 'i18next';
import { DownloadIcon, HistoryIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type {
  AcaoLinha,
  ColunaGrid,
  ExportacaoGrid,
  FiltroGrid,
  FiltroStatus,
} from '@/components/shared/data-grid/tipos';
import { useExportacao } from '@/components/shared/data-grid/use-exportacao';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { formatarData as formatarDataIdioma, formatarDataHora } from '@/lib/formatar';
import { formatarMascara } from '@/lib/forms/mascaras';
import { DetalhePaciente } from './DetalhePaciente';
import { iniciaisDe } from './formatadores';
import { HistoricoPaciente } from './HistoricoPaciente';
import { ModalPaciente } from './ModalPaciente';
import { StatusPaciente } from './StatusPaciente';
import { URL_PACIENTES, useAbrirPaciente, useExcluirPaciente } from './use-pacientes';

const STATUS: FiltroStatus = {
  opcoes: [
    { valor: 'ATIVO', rotulo: 'Ativo' },
    { valor: 'INATIVO', rotulo: 'Inativo' },
  ],
};

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'comercial-atendimento.pacientes.exportar',
  nomeArquivo: 'pacientes',
  schema: exportPacientesQuerySchema,
};

const TAMANHOS_PAGINA = [20, 50, 100] as const;

const DIAS_SEM_RETORNO = [30, 60, 90, 180] as const;

const COLUNAS: ColunaGrid<Paciente>[] = [
  {
    id: 'nome',
    titulo: 'Nome',
    ordenavel: true,
    exportavel: true,
    ocultavel: false,
    celula: (p) => (
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
        >
          {iniciaisDe(p.nome)}
        </span>
        <span className="font-medium">{p.nome}</span>
      </div>
    ),
  },
  {
    id: 'documento',
    titulo: 'Documento',
    exportavel: true,
    ocultavel: false,
    celula: (p) => (
      <div className="grid">
        <span className="font-mono text-xs">
          {p.documento ? formatarMascara(p.tipo === 'PF' ? 'cpf' : 'cnpj', p.documento) : '-'}
        </span>
        <span className="text-[0.7rem] text-muted-foreground">{p.tipo}</span>
      </div>
    ),
  },
  {
    id: 'telefone',
    titulo: 'Telefone',
    ordenavel: true,
    exportavel: true,
    celula: (p) => {
      const telefone = p.celular ?? p.telefone;
      return telefone ? formatarMascara('telefone', telefone) : '-';
    },
  },
  { id: 'email', titulo: 'Email', ordenavel: true, exportavel: true },
  {
    id: 'origem',
    titulo: 'Origem',
    ordenavel: true,
    exportavel: true,
    celula: (p) => p.origemNome ?? '-',
  },
  {
    id: 'status',
    titulo: 'Status',
    ordenavel: true,
    exportavel: true,
    celula: (p) => <StatusPaciente status={p.status} />,
  },
];

/** Colunas de relacionamento (issue #148): começam ocultas, o botão Colunas as mostra. */
function colunasRelacionamento(t: TFunction): ColunaGrid<Paciente>[] {
  return [
    {
      id: 'canalOrigem',
      titulo: t('pacientes.colunas.canal'),
      oculta: true,
      celula: (p) => (p.canalOrigem ? t(`pacientes.canais.${p.canalOrigem}`) : '-'),
    },
    {
      id: 'ultimoAtendimento',
      titulo: t('pacientes.colunas.ultimoAtendimento'),
      oculta: true,
      celula: (p) => formatarDataIdioma(p.ultimoAtendimento),
    },
    {
      id: 'proximoRetorno',
      titulo: t('pacientes.colunas.proximoRetorno'),
      oculta: true,
      celula: (p) => formatarDataHora(p.proximoRetorno),
    },
    {
      id: 'faltas',
      titulo: t('pacientes.colunas.faltas'),
      oculta: true,
      celula: (p) => String(p.faltas),
    },
  ];
}

/**
 * Pacientes (`/clientes`, docs/inventario/telas/comercial-atendimento-pacientes.md): cadastro de
 * pacientes e clientes, pessoa física ou jurídica. Clicar na linha abre o detalhe.
 */
export default function PacientesPage() {
  const { t } = useTranslation();
  const colunas = useMemo(() => [...COLUNAS, ...colunasRelacionamento(t)], [t]);
  const filtros = useMemo<readonly FiltroGrid[]>(
    () => [
      {
        tipo: 'entidade',
        parametro: 'origemClienteId',
        rotulo: t('pacientes.filtros.origem'),
        entidade: 'origens-cliente',
        rotuloTodos: t('pacientes.filtros.origem'),
      },
      {
        tipo: 'select',
        parametro: 'canalOrigem',
        rotulo: t('pacientes.filtros.canal'),
        rotuloTodos: t('pacientes.filtros.todosCanais'),
        opcoes: PACIENTE_CANAIS_ORIGEM.map((valor) => ({
          valor,
          rotulo: t(`pacientes.canais.${valor}`),
        })),
      },
      {
        tipo: 'select',
        parametro: 'semRetornoDias',
        rotulo: t('pacientes.filtros.semRetorno'),
        rotuloTodos: t('pacientes.filtros.semRetorno'),
        opcoes: DIAS_SEM_RETORNO.map((dias) => ({
          valor: String(dias),
          rotulo: t('pacientes.filtros.semRetornoDias', { count: dias }),
        })),
      },
      { tipo: 'checkbox', parametro: 'comFaltas', rotulo: t('pacientes.filtros.comFaltas') },
      {
        tipo: 'periodo',
        rotulo: t('pacientes.filtros.novosNoPeriodo'),
        parametroDe: 'novosDe',
        parametroAte: 'novosAte',
      },
    ],
    [t],
  );
  const [criando, setCriando] = useState(false);
  const [detalhando, setDetalhando] = useState<Paciente | null>(null);
  const [editando, setEditando] = useState<Paciente | null>(null);
  const [historico, setHistorico] = useState<Paciente | null>(null);
  const [excluindo, setExcluindo] = useState<Paciente | null>(null);
  const excluir = useExcluirPaciente();
  const abrir = useAbrirPaciente();
  const exportacao = useExportacao({
    url: `${URL_PACIENTES}/export`,
    ...EXPORTACAO,
  });

  /** Alerta de duplicidade: fecha o cadastro e mostra o paciente que já existe. */
  async function abrirExistente(id: string) {
    const existente = await abrir.mutateAsync(id);
    setCriando(false);
    setEditando(null);
    setDetalhando(existente);
  }

  const acoes = (paciente: Paciente): AcaoLinha[] => [
    {
      rotulo: 'Histórico',
      icone: HistoryIcon,
      permissao: 'configuracoes-gestao.auditoria.ver',
      onSelect: () => setHistorico(paciente),
    },
    {
      rotulo: 'Editar',
      icone: PencilIcon,
      permissao: 'comercial-atendimento.pacientes.editar',
      onSelect: () => setEditando(paciente),
    },
    {
      rotulo: 'Excluir',
      icone: Trash2Icon,
      destrutiva: true,
      permissao: 'comercial-atendimento.pacientes.excluir',
      onSelect: () => setExcluindo(paciente),
    },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Pacientes"
        descricao="Gerencie seus pacientes e clientes."
        acoes={
          <>
            {exportacao.permitido && (
              <Button
                type="button"
                variant="outline"
                disabled={exportacao.exportando}
                onClick={() => exportacao.exportar('xlsx')}
              >
                <DownloadIcon aria-hidden />
                Exportar Excel
              </Button>
            )}
            <SePermitido permissao="comercial-atendimento.pacientes.criar">
              <Button type="button" onClick={() => setCriando(true)}>
                <PlusIcon aria-hidden />
                Novo Paciente
              </Button>
            </SePermitido>
          </>
        }
      />
      <DataGrid
        url={URL_PACIENTES}
        schema={pacientePageSchema}
        querySchema={listPacientesQuerySchema}
        colunas={colunas}
        filtros={filtros}
        busca="Buscar por nome, CPF, celular, email..."
        status={STATUS}
        exportacao={EXPORTACAO}
        tamanhosPagina={TAMANHOS_PAGINA}
        acoes={acoes}
        aoClicarLinha={setDetalhando}
        mensagemVazio="Nenhum paciente encontrado."
      />
      {criando && (
        <ModalPaciente onFechar={() => setCriando(false)} onAbrirExistente={abrirExistente} />
      )}
      {editando && (
        <ModalPaciente
          paciente={editando}
          onFechar={() => setEditando(null)}
          onAbrirExistente={abrirExistente}
        />
      )}
      {detalhando && (
        <DetalhePaciente
          paciente={detalhando}
          onFechar={() => setDetalhando(null)}
          onEditar={() => {
            setEditando(detalhando);
            setDetalhando(null);
          }}
          onHistorico={() => {
            setHistorico(detalhando);
            setDetalhando(null);
          }}
        />
      )}
      {historico && <HistoricoPaciente paciente={historico} onFechar={() => setHistorico(null)} />}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir paciente"
        descricao={`Excluir o paciente "${excluindo?.nome ?? ''}"? O cadastro deixa de aparecer na lista.`}
        rotuloConfirmar="Excluir"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
