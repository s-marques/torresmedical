import { CONTA_RECEBER_ROTULO_STATUS, type ContaReceber } from '@torres/shared';
import { PencilIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Modal } from '@/components/shared/Modal';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { formatarData } from '@/lib/formatar';
import { formatarMoeda } from '@/lib/forms/mascaras';

function Item({ rotulo, children }: Readonly<{ rotulo: string; children: ReactNode }>) {
  return (
    <div className="grid gap-1">
      <dt className="text-sm text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm font-medium break-words">{children || '-'}</dd>
    </div>
  );
}

const TOM_STATUS: Record<ContaReceber['status'], 'sucesso' | 'alerta' | 'perigo'> = {
  PENDENTE: 'alerta',
  RECEBIDO: 'sucesso',
  VENCIDO: 'perigo',
};

export interface DetalheContaReceberProps {
  conta: ContaReceber;
  onFechar: () => void;
  onEditar: () => void;
}

/** Modal de detalhe (clique na linha ou "Detalhar" no menu de ações). */
export function DetalheContaReceber({
  conta: c,
  onFechar,
  onEditar,
}: Readonly<DetalheContaReceberProps>) {
  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={c.descricao}
      rodape={
        <>
          <Button type="button" variant="outline" onClick={onFechar}>
            Fechar
          </Button>
          <SePermitido permissao="financeiro.contas-receber.editar">
            <Button type="button" onClick={onEditar}>
              <PencilIcon aria-hidden />
              Editar
            </Button>
          </SePermitido>
        </>
      }
    >
      <dl className="grid gap-4 sm:grid-cols-2">
        <Item rotulo="Cliente">{c.pacienteNome}</Item>
        <Item rotulo="Valor">{formatarMoeda(Number(c.valor))}</Item>
        <Item rotulo="Data de Vencimento">{formatarData(c.dataVencimento)}</Item>
        <Item rotulo="Status">
          <StatusBadge tom={TOM_STATUS[c.status]}>
            {CONTA_RECEBER_ROTULO_STATUS[c.status]}
          </StatusBadge>
        </Item>
        <Item rotulo="Forma de Pagamento">{c.formaPagamentoNome}</Item>
        <Item rotulo="Plano de Contas">{c.planoContaNome}</Item>
        <Item rotulo="Documento">{c.documento}</Item>
        <Item rotulo="Total Parcelas">{c.totalParcelas}</Item>
        <Item rotulo="Observações">{c.observacoes}</Item>
      </dl>
    </Modal>
  );
}
