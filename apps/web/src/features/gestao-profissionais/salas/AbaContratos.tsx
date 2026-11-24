import {
  CONTRATO_MODALIDADE_CAMPOS,
  CONTRATO_MODALIDADE_ROTULOS,
  contratoSalaPageSchema,
  descreverDiaContrato,
  descreverValorContrato,
  exportContratosSalaQuerySchema,
  formatarCompetencia,
  listContratosSalaQuerySchema,
  type ContratoModalidade,
  type ContratoSala,
} from '@torres/shared';
import {
  AlertTriangleIcon,
  BanIcon,
  CoinsIcon,
  FileSignatureIcon,
  PencilIcon,
  SearchIcon,
  TimerIcon,
  Trash2Icon,
  XCircleIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, ExportacaoGrid } from '@/components/shared/data-grid/tipos';
import { SePermitido } from '@/components/shared/SePermitido';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { hojeISO } from '@/lib/datas';
import { formatarData } from '@/lib/formatar';
import { ModalAssinarContrato } from './ModalAssinarContrato';
import { ModalContrato } from './ModalContrato';
import { ModalDetalhesContrato } from './ModalDetalhesContrato';
import { ModalFecharContrato } from './ModalFecharContrato';
import { ModalGerarParcelaContrato } from './ModalGerarParcelaContrato';
import { ModalHorasContrato } from './ModalHorasContrato';
import { PdfContrato } from './PdfContrato';
import { StatusContrato } from './StatusContrato';
import { URL_CONTRATOS, useExcluirContrato, useGerarCobrancasDoMes } from './use-contratos-sala';

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'gestao-profissionais.salas.exportar',
  nomeArquivo: 'contratos-salas',
  schema: exportContratosSalaQuerySchema,
};

const COMPETENCIA_ATUAL = hojeISO().slice(0, 7);

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
  const { t } = useTranslation();
  const [detalhando, setDetalhando] = useState<ContratoSala | null>(null);
  const [editando, setEditando] = useState<ContratoSala | null>(null);
  const [lancandoHoras, setLancandoHoras] = useState<ContratoSala | null>(null);
  const [fechando, setFechando] = useState<{
    contrato: ContratoSala;
    tipo: 'encerrar' | 'cancelar';
  } | null>(null);
  const [excluindo, setExcluindo] = useState<ContratoSala | null>(null);
  const [gerandoParcela, setGerandoParcela] = useState<ContratoSala | null>(null);
  const [assinando, setAssinando] = useState<ContratoSala | null>(null);
  const excluir = useExcluirContrato();
  const gerarCobrancasDoMes = useGerarCobrancasDoMes();

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
      celula: (c) => (
        <div className="grid justify-items-start gap-0.5">
          <StatusContrato status={c.status} />
          {c.encerradoEm && (
            <span className="text-xs text-muted-foreground">
              Enc. {formatarData(c.encerradoEm)}
            </span>
          )}
          {c.semCobrancaNoMes && (
            <span className="flex items-center gap-1 text-xs text-amber-600">
              <AlertTriangleIcon aria-hidden className="size-3" />
              Sem cobrança em {formatarCompetencia(COMPETENCIA_ATUAL)}
            </span>
          )}
        </div>
      ),
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
          {c.modalidade === 'HORA' && c.status === 'ATIVO' && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-blue-600 hover:text-blue-600"
              aria-label={`Horas utilizadas de ${c.locatarioNome}`}
              title="Horas utilizadas"
              onClick={() => setLancandoHoras(c)}
            >
              <TimerIcon aria-hidden />
            </Button>
          )}
          {c.semCobrancaNoMes && (
            <SePermitido permissao="gestao-profissionais.salas.editar">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-amber-600 hover:text-amber-600"
                aria-label={`Gerar parcela de ${formatarCompetencia(COMPETENCIA_ATUAL)} de ${c.locatarioNome}`}
                title={`Contrato sem cobrança em ${formatarCompetencia(COMPETENCIA_ATUAL)}: gerar parcela do mês`}
                onClick={() => setGerandoParcela(c)}
              >
                <CoinsIcon aria-hidden />
              </Button>
            </SePermitido>
          )}
          {c.status === 'AGUARDANDO_ASSINATURA' && (
            <SePermitido permissao="gestao-profissionais.salas.editar">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-emerald-600 hover:text-emerald-600"
                aria-label={t('onboarding.assinatura.acaoDe', { nome: c.locatarioNome })}
                title={t('onboarding.assinatura.acao')}
                onClick={() => setAssinando(c)}
              >
                <FileSignatureIcon aria-hidden />
              </Button>
            </SePermitido>
          )}
          {c.status === 'ATIVO' && (
            <SePermitido permissao="gestao-profissionais.salas.editar">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-orange-500 hover:text-orange-500"
                aria-label={`Encerrar contrato de ${c.locatarioNome}`}
                title="Encerrar contrato (término natural)"
                onClick={() => setFechando({ contrato: c, tipo: 'encerrar' })}
              >
                <BanIcon aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-destructive hover:text-destructive"
                aria-label={`Cancelar contrato de ${c.locatarioNome}`}
                title="Cancelar contrato (rescisão)"
                onClick={() => setFechando({ contrato: c, tipo: 'cancelar' })}
              >
                <XCircleIcon aria-hidden />
              </Button>
            </SePermitido>
          )}
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
      <div className="flex justify-end">
        <SePermitido permissao="gestao-profissionais.salas.editar">
          <Button
            type="button"
            variant="outline"
            disabled={gerarCobrancasDoMes.isPending}
            onClick={() => gerarCobrancasDoMes.mutate()}
          >
            <CoinsIcon aria-hidden />
            Gerar Cobranças do Mês
          </Button>
        </SePermitido>
      </div>
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
      {lancandoHoras && (
        <ModalHorasContrato contrato={lancandoHoras} onFechar={() => setLancandoHoras(null)} />
      )}
      {gerandoParcela && (
        <ModalGerarParcelaContrato
          contrato={gerandoParcela}
          onFechar={() => setGerandoParcela(null)}
        />
      )}
      {assinando && (
        <ModalAssinarContrato contrato={assinando} onFechar={() => setAssinando(null)} />
      )}
      {fechando && (
        <ModalFecharContrato
          contrato={fechando.contrato}
          tipo={fechando.tipo}
          onFechar={() => setFechando(null)}
        />
      )}
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
