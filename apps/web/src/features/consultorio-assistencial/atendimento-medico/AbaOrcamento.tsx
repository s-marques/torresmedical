import { ORCAMENTO_ROTULO_STATUS, type Orcamento } from '@torres/shared';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { formatarData } from '@/lib/formatar';
import { ModalNovoOrcamento } from '@/features/comercial-atendimento/orcamentos/ModalNovoOrcamento';
import { useOrcamentosPaciente } from './use-atendimento-medico';

const TOM_STATUS: Record<Orcamento['status'], TomStatus> = {
  PENDENTE: 'alerta',
  APROVADO: 'info',
  CONCLUIDO: 'sucesso',
  CANCELADO: 'perigo',
};

/**
 * Aba "Orçamento": o mesmo orçamento da tela Orçamentos (comercial-atendimento), já com o paciente
 * do atendimento, e a lista dos orçamentos dele (confirmado pelo dev).
 */
export function AbaOrcamento({ pacienteId }: Readonly<{ pacienteId: string }>) {
  const [criando, setCriando] = useState(false);
  const { data, isPending, isError } = useOrcamentosPaciente(pacienteId);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Orçamento</h3>
        <SePermitido permissao="comercial-atendimento.orcamentos.criar">
          <Button onClick={() => setCriando(true)}>
            <PlusIcon aria-hidden />
            Novo Orçamento
          </Button>
        </SePermitido>
      </div>

      {isPending && <Skeleton className="h-16 w-full" aria-label="Carregando" />}
      {isError && (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar os orçamentos.
        </p>
      )}
      {data && data.data.length === 0 && (
        <p role="status" className="py-4 text-center text-sm text-muted-foreground">
          Nenhum orçamento para este paciente
        </p>
      )}
      {data && data.data.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm" aria-label="Orçamentos do paciente">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Itens</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((o) => (
                <tr key={o.id} className="border-t">
                  <td className="px-3 py-2">{o.numero}</td>
                  <td className="px-3 py-2">{formatarData(o.data)}</td>
                  <td className="px-3 py-2">{o.itens.map((i) => i.descricao).join(', ')}</td>
                  <td className="px-3 py-2 text-right">{formatarMoeda(Number(o.total))}</td>
                  <td className="px-3 py-2">
                    <StatusBadge tom={TOM_STATUS[o.status]}>
                      {ORCAMENTO_ROTULO_STATUS[o.status]}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {criando && <ModalNovoOrcamento pacienteId={pacienteId} onFechar={() => setCriando(false)} />}
    </div>
  );
}
