import { COMPRA_ROTULO_STATUS, type Compra } from '@torres/shared';
import { PencilIcon, Trash2Icon, XCircleIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Modal } from '@/components/shared/Modal';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { formatarData } from '@/lib/formatar';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { TOM_STATUS_COMPRA } from './opcoes';

function Item({ rotulo, children }: Readonly<{ rotulo: string; children: ReactNode }>) {
  return (
    <div className="grid gap-1">
      <dt className="text-sm text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm font-medium break-words">{children || '-'}</dd>
    </div>
  );
}

export interface DetalheCompraProps {
  compra: Compra;
  onFechar: () => void;
  onEditar: () => void;
  onCancelar: () => void;
  onExcluir: () => void;
}

/** Modal de detalhe (clique na linha ou "Ver detalhes"), com Editar, Excluir e Fechar. */
export function DetalheCompra({
  compra: c,
  onFechar,
  onEditar,
  onCancelar,
  onExcluir,
}: Readonly<DetalheCompraProps>) {
  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={`Compra #${c.numero}`}
      tamanho="lg"
      rodape={
        <>
          <Button type="button" variant="outline" onClick={onFechar}>
            Fechar
          </Button>
          {c.status !== 'CANCELADA' && (
            <SePermitido permissao="compras-estoque.entrada-compras.editar">
              <Button type="button" variant="outline" onClick={onCancelar}>
                <XCircleIcon aria-hidden />
                Cancelar compra
              </Button>
            </SePermitido>
          )}
          <SePermitido permissao="compras-estoque.entrada-compras.excluir">
            <Button type="button" variant="destructive" onClick={onExcluir}>
              <Trash2Icon aria-hidden />
              Excluir
            </Button>
          </SePermitido>
          {c.status !== 'CANCELADA' && (
            <SePermitido permissao="compras-estoque.entrada-compras.editar">
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
        <Item rotulo="Fornecedor">{c.fornecedorNome}</Item>
        <Item rotulo="Status">
          <StatusBadge tom={TOM_STATUS_COMPRA[c.status]}>
            {COMPRA_ROTULO_STATUS[c.status]}
          </StatusBadge>
        </Item>
        <Item rotulo="Numero NF">{c.numeroNf}</Item>
        <Item rotulo="Serie NF">{c.serieNf}</Item>
        <Item rotulo="Data Emissao">{c.dataEmissao ? formatarData(c.dataEmissao) : null}</Item>
        <Item rotulo="Data Entrada">{formatarData(c.dataEntrada)}</Item>
        <Item rotulo="Frete">{formatarMoeda(Number(c.frete))}</Item>
        <Item rotulo="Desconto">{formatarMoeda(Number(c.desconto))}</Item>
        <Item rotulo="Valor Total">{formatarMoeda(Number(c.valorTotal))}</Item>
        <Item rotulo="Observacoes">{c.observacoes}</Item>
      </dl>
      <div className="mt-4 grid gap-2">
        <h3 className="text-sm font-medium">Itens</h3>
        <div className="overflow-x-auto rounded-lg border text-sm">
          <table className="w-full">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Descricao</th>
                <th className="px-3 py-2 text-right font-medium">Qtd</th>
                <th className="px-3 py-2 text-right font-medium">Unitario</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 font-medium">Conta contábil</th>
              </tr>
            </thead>
            <tbody>
              {c.itens.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-3 py-2">{item.descricao}</td>
                  <td className="px-3 py-2 text-right">{Number(item.quantidade)}</td>
                  <td className="px-3 py-2 text-right">
                    {formatarMoeda(Number(item.valorUnitario))}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {formatarMoeda(Number(item.valorTotal))}
                  </td>
                  <td className="px-3 py-2">{item.planoContaNome ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
