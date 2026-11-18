import { PEDIDO_COMPRA_ROTULO_STATUS, type PedidoCompra } from '@torres/shared';
import { CheckCircleIcon, PencilIcon, Trash2Icon, XCircleIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Modal } from '@/components/shared/Modal';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { formatarData } from '@/lib/formatar';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { TOM_STATUS_PEDIDO } from './opcoes';

function Item({ rotulo, children }: Readonly<{ rotulo: string; children: ReactNode }>) {
  return (
    <div className="grid gap-1">
      <dt className="text-sm text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm font-medium break-words">{children || '-'}</dd>
    </div>
  );
}

export interface DetalhePedidoProps {
  pedido: PedidoCompra;
  onFechar: () => void;
  onEditar: () => void;
  onReceber: () => void;
  onCancelar: () => void;
  onExcluir: () => void;
}

/**
 * Modal de detalhe (clique na linha ou "Ver detalhes"). Editar, Marcar como recebido e Cancelar
 * só para pedidos em trânsito; Excluir em qualquer status.
 */
export function DetalhePedido({
  pedido: p,
  onFechar,
  onEditar,
  onReceber,
  onCancelar,
  onExcluir,
}: Readonly<DetalhePedidoProps>) {
  const emTransito = p.status === 'EM_TRANSITO';
  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={p.numeroNf ? `Pedido de Compra NF ${p.numeroNf}` : 'Pedido de Compra'}
      tamanho="lg"
      rodape={
        <>
          <Button type="button" variant="outline" onClick={onFechar}>
            Fechar
          </Button>
          <SePermitido permissao="compras-estoque.pedidos-transito.excluir">
            <Button type="button" variant="destructive" onClick={onExcluir}>
              <Trash2Icon aria-hidden />
              Excluir
            </Button>
          </SePermitido>
          {emTransito && (
            <SePermitido permissao="compras-estoque.pedidos-transito.editar">
              <Button type="button" variant="outline" onClick={onCancelar}>
                <XCircleIcon aria-hidden />
                Cancelar pedido
              </Button>
              <Button type="button" variant="outline" onClick={onReceber}>
                <CheckCircleIcon aria-hidden />
                Marcar como recebido
              </Button>
              <Button type="button" onClick={onEditar}>
                <PencilIcon aria-hidden />
                Editar
              </Button>
            </SePermitido>
          )}
        </>
      }
    >
      <dl className="grid gap-4 sm:grid-cols-2">
        <Item rotulo="Fornecedor">{p.fornecedorNome}</Item>
        <Item rotulo="Status">
          <StatusBadge tom={TOM_STATUS_PEDIDO[p.status]}>
            {PEDIDO_COMPRA_ROTULO_STATUS[p.status]}
          </StatusBadge>
        </Item>
        <Item rotulo="Numero NF">{p.numeroNf}</Item>
        <Item rotulo="Data Pedido">{formatarData(p.dataPedido)}</Item>
        <Item rotulo="Previsao Entrega">
          {p.dataPrevisao ? formatarData(p.dataPrevisao) : null}
        </Item>
        <Item rotulo="Valor Total">{formatarMoeda(Number(p.valorTotal))}</Item>
        <Item rotulo="Observacoes">{p.observacoes}</Item>
      </dl>
      <div className="mt-4 grid gap-2">
        <h3 className="text-sm font-medium">Itens do Pedido</h3>
        {p.itens.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum item.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border text-sm">
            <table className="w-full">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Produto</th>
                  <th className="px-3 py-2 text-right font-medium">Qtd</th>
                  <th className="px-3 py-2 text-right font-medium">Unitario</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {p.itens.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="px-3 py-2">{item.produtoNome ?? '-'}</td>
                    <td className="px-3 py-2 text-right">{Number(item.quantidade)}</td>
                    <td className="px-3 py-2 text-right">
                      {formatarMoeda(Number(item.valorUnitario))}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {formatarMoeda(Number(item.valorTotal))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
