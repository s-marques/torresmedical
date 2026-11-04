import {
  CONSULTA_SEM_COBRANCA,
  consultaRealizadaPageSchema,
  exportConsultasRealizadasQuerySchema,
  listConsultasRealizadasQuerySchema,
  totaisConsultasRealizadasQuerySchema,
  type ConsultaRealizada,
} from '@torres/shared';
import { CircleDollarSignIcon, ReceiptTextIcon } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type {
  ColunaGrid,
  ExportacaoGrid,
  FiltroGrid,
  FiltroStatus,
} from '@/components/shared/data-grid/tipos';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatarData } from '@/lib/formatar';
import { formatarMascara, formatarMoeda } from '@/lib/forms/mascaras';
import { URL_CONSULTAS, useTotaisConsultas } from './use-vendas';

const STATUS: FiltroStatus = {
  parametro: 'pagamento',
  opcoes: [
    { valor: 'pago', rotulo: 'Pago' },
    { valor: 'pendente', rotulo: 'Pendente' },
  ],
};

const FILTROS: readonly FiltroGrid[] = [
  { tipo: 'periodo', rotulo: 'Período', parametroDe: 'de', parametroAte: 'ate' },
];

const EXPORTACAO: ExportacaoGrid = {
  permissao: 'comercial-atendimento.vendas-pdv.exportar',
  nomeArquivo: 'consultas-realizadas',
  schema: exportConsultasRealizadasQuerySchema,
};

const HORA = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

/**
 * Receber e NFSe aparecem como no inventário, mas ainda sem ação: o fluxo de cada um depende da
 * confirmação da equipe de QA (pendência registrada no card #15).
 */
const AGUARDANDO_QA = 'Aguardando a definição do fluxo pela equipe de QA';

function BotaoPendenteQa({ pago }: Readonly<{ pago: boolean }>) {
  const Icone = pago ? ReceiptTextIcon : CircleDollarSignIcon;
  return (
    <Button type="button" variant="outline" size="sm" disabled title={AGUARDANDO_QA}>
      <Icone aria-hidden />
      {pago ? 'NFSe' : 'Receber'}
    </Button>
  );
}

const COLUNAS: ColunaGrid<ConsultaRealizada>[] = [
  {
    id: 'data',
    titulo: 'Data',
    ordenavel: true,
    exportavel: true,
    celula: (c) => (
      <div className="grid leading-tight">
        <span className="font-medium">{formatarData(c.data)}</span>
        <span className="text-xs text-muted-foreground">{HORA.format(new Date(c.data))}</span>
      </div>
    ),
  },
  {
    id: 'paciente',
    titulo: 'Paciente',
    ordenavel: true,
    exportavel: true,
    celula: (c) => (
      <div className="grid leading-tight">
        <span className="font-medium">{c.paciente}</span>
        {c.pacienteTelefone && (
          <span className="text-xs text-muted-foreground">
            {formatarMascara('telefone', c.pacienteTelefone)}
          </span>
        )}
      </div>
    ),
  },
  {
    id: 'profissional',
    titulo: 'Profissional',
    ordenavel: true,
    exportavel: true,
    celula: (c) => <span className="uppercase">{c.profissional}</span>,
  },
  {
    id: 'tipo',
    titulo: 'Tipo',
    ordenavel: true,
    exportavel: true,
    celula: (c) => (c.tipo ? <Badge variant="secondary">{c.tipo}</Badge> : '-'),
  },
  {
    id: 'valor',
    titulo: 'Valor',
    ordenavel: true,
    exportavel: true,
    celula: (c) => <span className="font-medium">{formatarMoeda(Number(c.valor))}</span>,
  },
  {
    id: 'pagamento',
    titulo: 'Pagamento',
    ordenavel: true,
    exportavel: true,
    celula: (c) =>
      c.pago ? (
        <StatusBadge tom="sucesso">
          {c.formaPagamento ? `Pago (${c.formaPagamento})` : 'Pago'}
        </StatusBadge>
      ) : (
        <StatusBadge>{CONSULTA_SEM_COBRANCA}</StatusBadge>
      ),
  },
  // A API ainda não emite NFSe (fila do módulo Regulatório): coluna sempre "-".
  { id: 'nfse', titulo: 'NFSe', ocultavel: true, celula: () => '-' },
  {
    id: 'acoes-consulta',
    titulo: 'Ações',
    ocultavel: false,
    celula: (c) => <BotaoPendenteQa pago={c.pago} />,
  },
];

function Card({
  titulo,
  valor,
  destaque,
}: Readonly<{ titulo: string; valor: string; destaque?: boolean }>) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{titulo}</p>
      <p
        className={
          destaque
            ? 'text-xl font-bold text-emerald-700 dark:text-emerald-400'
            : 'text-xl font-bold'
        }
      >
        {valor}
      </p>
    </div>
  );
}

/** Filtros do grid (na URL) que valem também para os cards. */
function useFiltrosDosCards() {
  const [params] = useSearchParams();
  const lidos = totaisConsultasRealizadasQuerySchema.safeParse({
    de: params.get('de') ?? undefined,
    ate: params.get('ate') ?? undefined,
    pagamento: params.get('pagamento') ?? undefined,
  });
  return lidos.success ? lidos.data : { de: undefined, ate: undefined };
}

/** Aba "Consultas Realizadas": cards do período e grid com Receber/NFSe por linha. */
export function ConsultasRealizadas() {
  const totais = useTotaisConsultas(useFiltrosDosCards()).data;

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3" aria-label="Totais do período">
        <Card titulo="Total Consultas" valor={String(totais?.totalConsultas ?? 0)} />
        <Card
          titulo="Valor Total"
          valor={formatarMoeda(Number(totais?.valorTotal ?? 0))}
          destaque
        />
        <Card titulo="Recebido" valor={formatarMoeda(Number(totais?.recebido ?? 0))} destaque />
      </div>
      <DataGrid
        url={URL_CONSULTAS}
        schema={consultaRealizadaPageSchema}
        querySchema={listConsultasRealizadasQuerySchema}
        colunas={COLUNAS}
        busca={false}
        status={STATUS}
        filtros={FILTROS}
        exportacao={EXPORTACAO}
        mensagemVazio="Nenhuma consulta encontrada."
      />
    </div>
  );
}
