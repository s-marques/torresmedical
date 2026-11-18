import {
  CONTA_BANCARIA_ROTULO_TIPO,
  descricaoContaBancaria,
  type ContaBancaria,
} from '@torres/shared';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { cn } from '@/lib/utils';
import {
  useContasBancarias,
  useExcluirContaBancaria,
} from '../contas-bancarias/use-contas-bancarias';
import { ModalNovaContaBancaria } from './ModalNovaContaBancaria';

function CardConta({
  conta,
  onExcluir,
}: Readonly<{ conta: ContaBancaria; onExcluir: () => void }>) {
  const saldo = Number(conta.saldo);
  const descricao = descricaoContaBancaria(conta);
  return (
    <Card className="py-4" aria-label={conta.nome}>
      <CardContent className="flex items-start justify-between gap-3 px-4">
        <div className="grid min-w-0 gap-1">
          <p className="truncate font-semibold uppercase" title={conta.nome}>
            {conta.nome}
          </p>
          {descricao && <p className="text-xs text-muted-foreground uppercase">{descricao}</p>}
          <StatusBadge className="w-fit">{CONTA_BANCARIA_ROTULO_TIPO[conta.tipo]}</StatusBadge>
        </div>
        <div className="flex items-start gap-2">
          <div className="grid justify-items-end">
            <span className="text-xs text-muted-foreground">Saldo</span>
            <span
              className={cn(
                'font-mono text-sm font-semibold whitespace-nowrap',
                saldo < 0 ? 'text-destructive' : 'text-emerald-600',
              )}
            >
              {formatarMoeda(saldo)}
            </span>
          </div>
          <SePermitido permissao="financeiro.conciliacao.excluir">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={`Excluir ${conta.nome}`}
              onClick={onExcluir}
            >
              <Trash2Icon aria-hidden />
            </Button>
          </SePermitido>
        </div>
      </CardContent>
    </Card>
  );
}

/** Aba "Contas Bancárias": cards com o saldo, "Nova Conta" e a lixeira de cada card. */
export function AbaContasBancarias() {
  const contas = useContasBancarias();
  const excluir = useExcluirContaBancaria();
  const [novaAberta, setNovaAberta] = useState(false);
  const [aExcluir, setAExcluir] = useState<ContaBancaria | null>(null);
  const lista = contas.data?.data ?? [];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Gerencie suas contas bancárias: caixa, corrente, poupança e investimento.
        </p>
        <SePermitido permissao="financeiro.conciliacao.criar">
          <Button
            type="button"
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => setNovaAberta(true)}
          >
            <PlusIcon aria-hidden />
            Nova Conta
          </Button>
        </SePermitido>
      </div>

      {lista.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((conta) => (
            <CardConta key={conta.id} conta={conta} onExcluir={() => setAExcluir(conta)} />
          ))}
        </div>
      ) : (
        <EmptyState
          titulo={contas.isPending ? 'Carregando…' : 'Nenhuma conta bancária cadastrada'}
        />
      )}

      {novaAberta && <ModalNovaContaBancaria onFechar={() => setNovaAberta(false)} />}
      <ConfirmDialog
        aberto={aExcluir !== null}
        onAbertoChange={(aberto) => aberto || setAExcluir(null)}
        titulo="Excluir conta bancária?"
        descricao={
          aExcluir &&
          `A conta "${aExcluir.nome}" deixa de aparecer na Conciliação e nos comboboxes. Os pagamentos e recebimentos já lançados nela continuam no histórico.`
        }
        rotuloConfirmar="Excluir"
        onConfirmar={async () => {
          if (aExcluir) await excluir.mutateAsync(aExcluir.id);
          setAExcluir(null);
        }}
      />
    </div>
  );
}
