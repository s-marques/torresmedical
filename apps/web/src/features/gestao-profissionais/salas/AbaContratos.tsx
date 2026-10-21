import {
  CONTRATO_MODALIDADE_CAMPOS,
  CONTRATO_MODALIDADE_ROTULOS,
  contratoSalaPageSchema,
  descreverDiaContrato,
  descreverValorContrato,
  exportContratosSalaQuerySchema,
  listContratosSalaQuerySchema,
  type ContratoModalidade,
  type ContratoSala,
} from '@torres/shared';
import { PencilIcon, SearchIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, ExportacaoGrid } from '@/components/shared/data-grid/tipos';
import { SePermitido } from '@/components/shared/SePermitido';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatarData } from '@/lib/formatar';
import { ModalContrato } from './ModalContrato';
import { ModalDetalhesContrato } from './ModalDetalhesContrato';
import { PdfContrato } from './PdfContrato';
import { StatusContrato } from './StatusContrato';
import { URL_CONTRATOS, useExcluirContrato } from './use-contratos-sala';

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'gestao-profissionais.salas.exportar',
  nomeArquivo: 'contratos-salas',
  schema: exportContratosSalaQuerySchema,
};

/** Rótulo do Tipo na tabela (o de Hora Avulsa é "Por Hora Avulsa"). */
const TIPO_NA_TABELA: Record<ContratoModalidade, string> = {
  ...CONTRATO_MODALIDADE_ROTULOS,
  HORA: 'Por Hora Avulsa',
};

function ValorContrato({ contrato }: Readonly<{ contrato: ContratoSala }>) {
  const campos = CONTRATO_MODALIDADE_CAMPOS[contrato.modalidade];
  const quantidade =
    contrato.modalidade === 'TURNO'
      ? `${contrato.quantidadeMensal} turno(s)`
      : `${contrato.quantidadeMensal}h contratadas`;
  return (
    <div className="text-right">
      <div className="whitespace-nowrap">{descreverValorContrato(contrato)}</div>
      {campos.quantidade !== null && (
        <div className="text-xs text-muted-foreground">{quantidade}</div>
      )}
    </div>
  );
}

export interface AbaContratosProps {
  criando: boolean;
  onFecharCriar: () => void;
}

/** Aba Contratos: tabela dos contratos, com PDF, Detalhar (lupa), Editar e Excluir. */
export function AbaContratos({ criando, onFecharCriar }: Readonly<AbaContratosProps>) {
  const [detalhando, setDetalhando] = useState<ContratoSala | null>(null);
  const [editando, setEditando] = useState<ContratoSala | null>(null);
  const [excluindo, setExcluindo] = useState<ContratoSala | null>(null);
  const excluir = useExcluirContrato();

  const colunas: ColunaGrid<ContratoSala>[] = [
    {
      id: 'sala',
      titulo: 'Sala',
      exportavel: true,
      ocultavel: false,
      celula: (c) => <span className="font-medium">{c.salaNome}</span>,
    },
    { id: 'locatario', titulo: 'Locatário', exportavel: true, celula: (c) => c.locatarioNome },
    {
      id: 'modalidade',
      titulo: 'Tipo',
      exportavel: true,
      celula: (c) => <Badge variant="outline">{TIPO_NA_TABELA[c.modalidade]}</Badge>,
    },
    {
      id: 'dias',
      titulo: 'Dias',
      exportavel: true,
      celula: (c) => (
        <div className="flex flex-wrap gap-1">
          {c.dias.map((dia) => (
            <Badge key={dia.diaSemana} variant="secondary">
              {descreverDiaContrato(dia)}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      id: 'valorUnitario',
      titulo: 'Valor',
      ordenavel: true,
      exportavel: 'valor',
      celula: (c) => <ValorContrato contrato={c} />,
    },
    {
      id: 'dataInicio',
      titulo: 'Vigência',
      ordenavel: true,
      exportavel: 'vigencia',
      celula: (c) => (
        <span className="whitespace-nowrap">
          {formatarData(c.dataInicio)} a {c.dataFim ? formatarData(c.dataFim) : 'indeterminado'}
        </span>
      ),
    },
    {
      id: 'status',
      titulo: 'Status',
      ordenavel: true,
      exportavel: true,
      celula: (c) => <StatusContrato status={c.status} />,
    },
    { id: 'pdf', titulo: 'PDF', celula: (c) => <PdfContrato contrato={c} /> },
    {
      id: 'acoes',
      titulo: 'Ações',
      ocultavel: false,
      celula: (c) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-blue-600 hover:text-blue-600"
            aria-label={`Detalhes do contrato de ${c.locatarioNome}`}
            title="Detalhar"
            onClick={() => setDetalhando(c)}
          >
            <SearchIcon aria-hidden />
          </Button>
          <SePermitido permissao="gestao-profissionais.salas.editar">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Editar contrato de ${c.locatarioNome}`}
              title="Editar"
              onClick={() => setEditando(c)}
            >
              <PencilIcon aria-hidden />
            </Button>
          </SePermitido>
          <SePermitido permissao="gestao-profissionais.salas.excluir">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-destructive hover:text-destructive"
              aria-label={`Excluir contrato de ${c.locatarioNome}`}
              title="Excluir"
              onClick={() => setExcluindo(c)}
            >
              <Trash2Icon aria-hidden />
            </Button>
          </SePermitido>
        </div>
      ),
    },
  ];

  return (
    <div className="grid gap-4">
      <DataGrid
        url={URL_CONTRATOS}
        schema={contratoSalaPageSchema}
        querySchema={listContratosSalaQuerySchema}
        colunas={colunas}
        busca={false}
        exportacao={EXPORTACAO}
        mensagemVazio="Nenhum contrato cadastrado."
      />
      {criando && <ModalContrato onFechar={onFecharCriar} />}
      {editando && <ModalContrato contrato={editando} onFechar={() => setEditando(null)} />}
      {detalhando && (
        <ModalDetalhesContrato
          contrato={detalhando}
          onFechar={() => setDetalhando(null)}
          onEditar={() => {
            setEditando(detalhando);
            setDetalhando(null);
          }}
        />
      )}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir contrato?"
        descricao={`O contrato de ${excluindo?.locatarioNome ?? ''} (${excluindo?.salaNome ?? ''}) será excluído. Esta ação não pode ser desfeita.`}
        rotuloConfirmar="Excluir"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
