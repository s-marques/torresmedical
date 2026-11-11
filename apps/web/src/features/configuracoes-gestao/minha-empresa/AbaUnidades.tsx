import {
  exportUnidadesQuerySchema,
  listUnidadesQuerySchema,
  unidadePageSchema,
  type Unidade,
} from '@torres/shared';
import { MapPinIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, ExportacaoGrid, FiltroStatus } from '@/components/shared/data-grid/tipos';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusAtivo } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { formatarMascara } from '@/lib/forms/mascaras';
import { ModalUnidade } from './ModalUnidade';
import { URL_UNIDADES, useExcluirUnidade } from './use-unidades';

const STATUS: FiltroStatus = {
  opcoes: [
    { valor: 'ativo', rotulo: 'Ativo' },
    { valor: 'inativo', rotulo: 'Inativo' },
  ],
};

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'configuracoes-gestao.minha-empresa.exportar',
  nomeArquivo: 'unidades',
  schema: exportUnidadesQuerySchema,
};

const COLUNAS: ColunaGrid<Unidade>[] = [
  { id: 'nome', titulo: 'Nome', ordenavel: true, exportavel: true, ocultavel: false },
  {
    id: 'cidade',
    titulo: 'Cidade',
    celula: (u) => (u.cidade && u.uf ? `${u.cidade}/${u.uf}` : '-'),
  },
  {
    id: 'telefone',
    titulo: 'Telefone',
    celula: (u) => (u.telefone ? formatarMascara('telefone', u.telefone) : '-'),
  },
  {
    id: 'status',
    titulo: 'Status',
    ordenavel: true,
    exportavel: true,
    celula: (u) => <StatusAtivo ativo={u.ativo} />,
  },
];

export interface AbaUnidadesProps {
  criando: boolean;
  onAbrirCriando: () => void;
  onFecharCriando: () => void;
}

/** Aba "Unidades": unidades/filiais da empresa. */
export function AbaUnidades({
  criando,
  onAbrirCriando,
  onFecharCriando,
}: Readonly<AbaUnidadesProps>) {
  const [editando, setEditando] = useState<Unidade | null>(null);
  const [excluindo, setExcluindo] = useState<Unidade | null>(null);
  const excluir = useExcluirUnidade();

  return (
    <div className="grid gap-4 rounded-lg border p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <MapPinIcon aria-hidden className="size-5" />
            Unidades / Filiais
          </h2>
          <p className="text-sm text-muted-foreground">
            Cadastre as unidades (clínicas, filiais) da sua empresa.
          </p>
        </div>
        <SePermitido permissao="configuracoes-gestao.minha-empresa.criar">
          <Button type="button" onClick={onAbrirCriando}>
            <PlusIcon aria-hidden />
            Nova Unidade
          </Button>
        </SePermitido>
      </div>
      <DataGrid
        url={URL_UNIDADES}
        schema={unidadePageSchema}
        querySchema={listUnidadesQuerySchema}
        colunas={COLUNAS}
        busca="Buscar unidades..."
        status={STATUS}
        exportacao={EXPORTACAO}
        mensagemVazio="Nenhuma unidade cadastrada"
        acoes={(unidade) => [
          {
            rotulo: 'Editar',
            icone: PencilIcon,
            permissao: 'configuracoes-gestao.minha-empresa.editar',
            onSelect: () => setEditando(unidade),
          },
          {
            rotulo: 'Excluir',
            icone: Trash2Icon,
            destrutiva: true,
            permissao: 'configuracoes-gestao.minha-empresa.excluir',
            onSelect: () => setExcluindo(unidade),
          },
        ]}
      />
      {criando && <ModalUnidade onFechar={onFecharCriando} />}
      {editando && <ModalUnidade unidade={editando} onFechar={() => setEditando(null)} />}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir Unidade"
        descricao={`Tem certeza que deseja excluir a unidade "${excluindo?.nome ?? ''}"? Esta ação não pode ser desfeita.`}
        rotuloConfirmar="Excluir"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
