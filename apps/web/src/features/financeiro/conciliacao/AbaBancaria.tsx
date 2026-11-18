import {
  CONCILIACAO_ROTULO_STATUS_LANCAMENTO,
  CONCILIACAO_ROTULO_TIPO_LANCAMENTO,
  CONCILIACAO_TIPOS_LANCAMENTO,
  type ConciliacaoStatusLancamento,
  type ConciliacaoTipoLancamento,
  type LancamentoConciliacao,
} from '@torres/shared';
import { ChevronLeftIcon, ChevronRightIcon, TrendingUpIcon } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatarData } from '@/lib/formatar';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { cn } from '@/lib/utils';
import { useContasBancarias } from '../contas-bancarias/use-contas-bancarias';
import {
  periodoInicial,
  useLancamentosConciliacao,
  useResumoConciliacao,
  type Periodo,
} from './use-conciliacao';

const TODAS = 'todas';

const TOM_STATUS: Readonly<Record<ConciliacaoStatusLancamento, TomStatus>> = {
  PAGO: 'sucesso',
  RECEBIDO: 'sucesso',
  PENDENTE: 'alerta',
  CANCELADO: 'neutro',
};

const moeda = (valor: string) => formatarMoeda(Number(valor));

/** Card "Saldo Sistema": Recebido, Pago e o saldo (Recebido − Pago) do período. */
function CardSaldoSistema({ periodo }: Readonly<{ periodo: Periodo }>) {
  const resumo = useResumoConciliacao(periodo);
  const saldo = resumo.data ? Number(resumo.data.saldo) : null;
  return (
    <Card
      aria-label="Saldo Sistema"
      className="max-w-sm border-blue-200 bg-blue-50/60 py-4 dark:border-blue-900 dark:bg-blue-950/40"
    >
      <CardContent className="flex items-end justify-between gap-4 px-4">
        <div className="grid gap-0.5 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Saldo Sistema</p>
          <p>Recebido: {resumo.data ? moeda(resumo.data.recebido) : '…'}</p>
          <p>Pago: {resumo.data ? moeda(resumo.data.pago) : '…'}</p>
        </div>
        <div className="grid justify-items-end gap-1">
          <TrendingUpIcon aria-hidden className="size-4 text-blue-600" />
          <p
            data-testid="saldo-sistema"
            className={cn(
              'text-xl font-semibold tabular-nums',
              saldo !== null && saldo < 0 ? 'text-destructive' : 'text-emerald-600',
            )}
          >
            {saldo === null ? '…' : formatarMoeda(saldo)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function LinhaLancamento({ lancamento }: Readonly<{ lancamento: LancamentoConciliacao }>) {
  const receber = lancamento.tipo === 'RECEBER';
  return (
    <li className="grid gap-1 border-b px-4 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <p className="truncate font-medium" title={lancamento.descricao}>
          {lancamento.descricao}
        </p>
        <p
          className={cn(
            'shrink-0 font-mono text-sm font-semibold',
            receber ? 'text-emerald-600' : 'text-destructive',
          )}
        >
          {moeda(lancamento.valor)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>{formatarData(lancamento.data)}</span>
        {lancamento.pessoaNome && <span className="truncate">{lancamento.pessoaNome}</span>}
        <StatusBadge tom={TOM_STATUS[lancamento.status]}>
          {CONCILIACAO_ROTULO_STATUS_LANCAMENTO[lancamento.status]}
        </StatusBadge>
      </div>
    </li>
  );
}

/** Painel "Lançamentos do Sistema": filtro de conta, A Pagar / A Receber e a lista paginada. */
function PainelLancamentos({ periodo }: Readonly<{ periodo: Periodo }>) {
  const [tipo, setTipo] = useState<ConciliacaoTipoLancamento>('PAGAR');
  const [contaBancariaId, setContaBancariaId] = useState('');
  // A página volta a 1 quando o período muda: ela vale só para o período em que foi escolhida.
  const chavePeriodo = `${periodo.de}|${periodo.ate}`;
  const [paginaDoPeriodo, setPaginaDoPeriodo] = useState({ chave: chavePeriodo, pagina: 1 });
  const pagina = paginaDoPeriodo.chave === chavePeriodo ? paginaDoPeriodo.pagina : 1;
  const setPagina = (nova: number) => setPaginaDoPeriodo({ chave: chavePeriodo, pagina: nova });
  const contas = useContasBancarias();
  const lancamentos = useLancamentosConciliacao({
    ...periodo,
    tipo,
    contaBancariaId,
    page: pagina,
  });
  const meta = lancamentos.data?.meta;
  const totalPaginas = Math.max(meta?.totalPages ?? 1, 1);

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <CardTitle className="text-sm">Lançamentos do Sistema</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={contaBancariaId || TODAS}
            onValueChange={(valor) => {
              setContaBancariaId(valor === TODAS ? '' : valor);
              setPagina(1);
            }}
          >
            <SelectTrigger aria-label="Conta bancária" size="sm" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODAS}>Todas as contas</SelectItem>
              {(contas.data?.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div
            role="group"
            aria-label="Tipo de lançamento"
            className="flex rounded-md bg-muted p-0.5"
          >
            {CONCILIACAO_TIPOS_LANCAMENTO.map((t) => (
              <Button
                key={t}
                type="button"
                size="sm"
                variant={tipo === t ? 'outline' : 'ghost'}
                aria-pressed={tipo === t}
                className="h-7"
                onClick={() => {
                  setTipo(t);
                  setPagina(1);
                }}
              >
                {CONCILIACAO_ROTULO_TIPO_LANCAMENTO[t]}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        {lancamentos.data && lancamentos.data.data.length > 0 ? (
          <ul aria-label="Lançamentos do Sistema">
            {lancamentos.data.data.map((l) => (
              <LinhaLancamento key={l.id} lancamento={l} />
            ))}
          </ul>
        ) : (
          <EmptyState
            titulo={lancamentos.isPending ? 'Carregando…' : 'Nenhum lançamento no período'}
          />
        )}
      </CardContent>
      {meta && meta.total > 0 && (
        <div className="flex items-center justify-end gap-2 border-t px-4 py-2 text-sm text-muted-foreground">
          <span>
            {meta.total} lançamento{meta.total === 1 ? '' : 's'} (pág {meta.page}/{totalPaginas})
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Página anterior"
            disabled={pagina <= 1}
            onClick={() => setPagina(pagina - 1)}
          >
            <ChevronLeftIcon aria-hidden />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Próxima página"
            disabled={pagina >= totalPaginas}
            onClick={() => setPagina(pagina + 1)}
          >
            <ChevronRightIcon aria-hidden />
          </Button>
        </div>
      )}
    </Card>
  );
}

/**
 * Aba "Bancaria" (parte 1 da #46): card "Saldo Sistema", período De/Até e o painel "Lançamentos
 * do Sistema". Extrato importado, "Saldo Banco", "Diferença", filtros de conciliação e
 * "Novo Lançamento" chegam na parte 2.
 */
export function AbaBancaria() {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoInicial());
  const invertido = Boolean(periodo.de && periodo.ate && periodo.de > periodo.ate);

  return (
    <div className="grid gap-4">
      <CardSaldoSistema periodo={periodo} />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="date"
          aria-label="Data inicial"
          className="w-40"
          value={periodo.de}
          onChange={(e) => setPeriodo((p) => ({ ...p, de: e.target.value }))}
        />
        <span className="text-sm text-muted-foreground">até</span>
        <Input
          type="date"
          aria-label="Data final"
          className="w-40"
          value={periodo.ate}
          aria-invalid={invertido}
          onChange={(e) => setPeriodo((p) => ({ ...p, ate: e.target.value }))}
        />
        {invertido && (
          <p role="alert" className="text-sm text-destructive">
            A data inicial deve ser anterior ou igual à data final
          </p>
        )}
      </div>
      <PainelLancamentos periodo={periodo} />
    </div>
  );
}
