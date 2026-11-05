import type { Permissao } from '@torres/shared';
import { PencilIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Modal } from '@/components/shared/Modal';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { formatarData } from '@/lib/formatar';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { StatusContaFinanceira } from './StatusContaFinanceira';

export function ItemDetalhe({
  rotulo,
  children,
}: Readonly<{ rotulo: string; children: ReactNode }>) {
  return (
    <div className="grid gap-1">
      <dt className="text-sm text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm font-medium break-words">{children || '-'}</dd>
    </div>
  );
}

interface ContaFinanceiraDetalhe {
  descricao: string;
  valor: string;
  dataVencimento: string;
  formaPagamentoNome: string | null;
  planoContaNome: string | null;
  documento: string | null;
  totalParcelas: number;
  observacoes: string | null;
}

export interface DetalheContaFinanceiraProps {
  conta: ContaFinanceiraDetalhe;
  /** Status exibido (com "Vencido" calculado) e seus rótulos. */
  status: string;
  rotulosStatus: Readonly<Record<string, string>>;
  /** Item da pessoa (fornecedor/funcionário ou cliente), o primeiro da lista. */
  pessoa: ReactNode;
  /** Itens próprios da tela, depois do Status (ex.: Valor Pago). */
  itensExtras?: ReactNode;
  /** Permissão do botão "Editar" e dos botões extras do rodapé. */
  permissaoEditar: Permissao;
  /** Botões do rodapé antes de "Editar" (ex.: Baixar, Cancelar Baixa). */
  acoesExtras?: ReactNode;
  /** Conteúdo depois da lista (ex.: histórico de baixas). */
  children?: ReactNode;
  tamanho?: 'lg';
  onFechar: () => void;
  onEditar: () => void;
}

/** Modal de detalhe (clique na linha ou "Detalhar" no menu de ações). */
export function DetalheContaFinanceira({
  conta: c,
  status,
  rotulosStatus,
  pessoa,
  itensExtras,
  permissaoEditar,
  acoesExtras,
  children,
  tamanho,
  onFechar,
  onEditar,
}: Readonly<DetalheContaFinanceiraProps>) {
  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={c.descricao}
      tamanho={tamanho}
      rodape={
        <>
          <Button type="button" variant="outline" onClick={onFechar}>
            Fechar
          </Button>
          <SePermitido permissao={permissaoEditar}>
            {acoesExtras}
            <Button type="button" onClick={onEditar}>
              <PencilIcon aria-hidden />
              Editar
            </Button>
          </SePermitido>
        </>
      }
    >
      <dl className="grid gap-4 sm:grid-cols-2">
        {pessoa}
        <ItemDetalhe rotulo="Valor">{formatarMoeda(Number(c.valor))}</ItemDetalhe>
        <ItemDetalhe rotulo="Data de Vencimento">{formatarData(c.dataVencimento)}</ItemDetalhe>
        <ItemDetalhe rotulo="Status">
          <StatusContaFinanceira status={status} rotulos={rotulosStatus} />
        </ItemDetalhe>
        {itensExtras}
        <ItemDetalhe rotulo="Forma de Pagamento">{c.formaPagamentoNome}</ItemDetalhe>
        <ItemDetalhe rotulo="Plano de Contas">{c.planoContaNome}</ItemDetalhe>
        <ItemDetalhe rotulo="Documento">{c.documento}</ItemDetalhe>
        <ItemDetalhe rotulo="Total Parcelas">{c.totalParcelas}</ItemDetalhe>
        <ItemDetalhe rotulo="Observações">{c.observacoes}</ItemDetalhe>
      </dl>
      {children}
    </Modal>
  );
}
