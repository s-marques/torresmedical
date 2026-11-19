import {
  exportPrestadoresQuerySchema,
  listPrestadoresQuerySchema,
  PRESTADOR_CATEGORIA_ROTULOS,
  PRESTADOR_STATUS_ROTULOS,
  prestadorPageSchema,
  rotuloNotaPrestador,
  type Prestador,
  type PrestadorStatus,
} from '@torres/shared';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
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
import { formatarMascara } from '@/lib/forms/mascaras';
import { ModalPrestador } from './ModalPrestador';
import { OPCOES_CATEGORIA, OPCOES_STATUS } from './opcoes';
import { URL_PRESTADORES, useExcluirPrestador } from './use-prestadores';

const STATUS: FiltroStatus = { opcoes: OPCOES_STATUS };

/** "Buscar prestador..." (nome ou nome fantasia) e "Todas categorias", como no inventário. */
const FILTROS: readonly FiltroGrid[] = [
  {
    tipo: 'texto',
    parametro: 'nome',
    rotulo: 'Buscar prestador',
    placeholder: 'Buscar prestador...',
  },
  {
    tipo: 'select',
    parametro: 'categoria',
    rotulo: 'Categoria',
    rotuloTodos: 'Todas categorias',
    opcoes: OPCOES_CATEGORIA,
  },
];

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'consultorio-assistencial.prestadores.exportar',
  nomeArquivo: 'prestadores',
  schema: exportPrestadoresQuerySchema,
};

const TOM_STATUS: Readonly<Record<PrestadorStatus, TomStatus>> = {
  ATIVO: 'sucesso',
  INATIVO: 'neutro',
  BLOQUEADO: 'perigo',
};

const COLUNAS: ColunaGrid<Prestador>[] = [
  { id: 'nome', titulo: 'Nome', ordenavel: true, exportavel: true, ocultavel: false },
  {
    id: 'categoria',
    titulo: 'Categoria',
    ordenavel: true,
    exportavel: true,
    celula: (p) => PRESTADOR_CATEGORIA_ROTULOS[p.categoria],
  },
  {
    id: 'telefone',
    titulo: 'Telefone',
    ordenavel: true,
    exportavel: true,
    celula: (p) => (p.telefone ? formatarMascara('telefone', p.telefone) : '-'),
  },
  {
    id: 'urgencia',
    titulo: 'Urgência',
    ordenavel: true,
    exportavel: true,
    celula: (p) => (p.atendeUrgencia ? 'Sim' : 'Não'),
  },
  {
    id: 'avaliacao',
    titulo: 'Avaliação',
    ordenavel: true,
    exportavel: true,
    celula: (p) => rotuloNotaPrestador(p.notaQualidade),
  },
  {
    id: 'status',
    titulo: 'Status',
    ordenavel: true,
    exportavel: true,
    celula: (p) => (
      <StatusBadge tom={TOM_STATUS[p.status]}>{PRESTADOR_STATUS_ROTULOS[p.status]}</StatusBadge>
    ),
  },
];

/**
 * Prestadores (`/prestadores`, docs/inventario/telas/consultorio-assistencial-prestadores.md):
 * prestadores de serviço de manutenção.
 */
export default function PrestadoresPage() {
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<Prestador | null>(null);
  const [excluindo, setExcluindo] = useState<Prestador | null>(null);
  const excluir = useExcluirPrestador();

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Prestadores de Serviço"
        descricao="Controle de fornecedores de manutenção"
        acoes={
          <SePermitido permissao="consultorio-assistencial.prestadores.criar">
            <Button type="button" onClick={() => setCriando(true)}>
              <PlusIcon aria-hidden />
              Novo Prestador
            </Button>
          </SePermitido>
        }
      />
      <DataGrid
        url={URL_PRESTADORES}
        schema={prestadorPageSchema}
        querySchema={listPrestadoresQuerySchema}
        colunas={COLUNAS}
        busca="Buscar prestadores..."
        status={STATUS}
        filtros={FILTROS}
        exportacao={EXPORTACAO}
        mensagemVazio="Nenhum prestador encontrado."
        acoes={(prestador) => [
          {
            rotulo: 'Editar',
            icone: PencilIcon,
            permissao: 'consultorio-assistencial.prestadores.editar',
            onSelect: () => setEditando(prestador),
          },
          {
            rotulo: 'Excluir',
            icone: Trash2Icon,
            destrutiva: true,
            permissao: 'consultorio-assistencial.prestadores.excluir',
            onSelect: () => setExcluindo(prestador),
          },
        ]}
      />
      {criando && <ModalPrestador onFechar={() => setCriando(false)} />}
      {editando && <ModalPrestador prestador={editando} onFechar={() => setEditando(null)} />}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir Prestador"
        descricao={`Tem certeza que deseja excluir o prestador "${excluindo?.nome ?? ''}"? Esta ação não pode ser desfeita.`}
        rotuloConfirmar="Excluir"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
