import {
  pedidoCompraInputSchema,
  subtotalPedidoCompra,
  totalItemPedido,
  valorTotalPedidoCompra,
  type PedidoCompra,
  type PedidoCompraFormulario,
} from '@torres/shared';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { Controller, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { EntitySelect } from '@/components/shared/EntitySelect';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { useCriarPedidoCompra, useEditarPedidoCompra } from './use-pedidos-compra';

const ID_FORMULARIO = 'form-pedido-compra';

export interface ModalPedidoProps {
  /** Com pedido: edição. */
  pedido?: PedidoCompra;
  onFechar: () => void;
}

const hoje = () => {
  const agora = new Date();
  const local = new Date(agora.getTime() - agora.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

function valoresIniciais(pedido?: PedidoCompra): PedidoCompraFormulario {
  if (!pedido) {
    return {
      fornecedorId: '',
      numeroNf: '',
      dataPedido: hoje(),
      dataPrevisao: '',
      valorTotal: null,
      observacoes: '',
      itens: [],
    };
  }
  return {
    fornecedorId: pedido.fornecedorId,
    numeroNf: pedido.numeroNf ?? '',
    dataPedido: pedido.dataPedido,
    dataPrevisao: pedido.dataPrevisao ?? '',
    // "Auto" volta vazio para continuar somando os itens.
    valorTotal: pedido.valorTotalInformado ? Number(pedido.valorTotal) : null,
    observacoes: pedido.observacoes ?? '',
    itens: pedido.itens.map((i) => ({
      produtoId: i.produtoId,
      quantidade: Number(i.quantidade),
      valorUnitario: Number(i.valorUnitario),
    })),
  };
}

const numeroOuNull = (texto: string) => (texto === '' ? null : Number(texto));

type CampoNumerico = 'quantidade' | 'valorUnitario';

function CelulaNumero({
  indice,
  campo,
  rotulo,
}: Readonly<{ indice: number; campo: CampoNumerico; rotulo: string }>) {
  const { control } = useFormContext<PedidoCompraFormulario>();
  return (
    <Controller
      control={control}
      name={`itens.${indice}.${campo}`}
      render={({ field, fieldState }) => (
        <Input
          type="number"
          min={0}
          step={campo === 'quantidade' ? 1 : 0.01}
          className="text-center"
          aria-label={rotulo}
          aria-invalid={fieldState.invalid}
          title={fieldState.error?.message}
          value={field.value ?? ''}
          onChange={(evento) => field.onChange(numeroOuNull(evento.target.value))}
          onBlur={field.onBlur}
        />
      )}
    />
  );
}

const paraTotal = (itens: PedidoCompraFormulario['itens']) =>
  (itens ?? []).map((i) => ({
    quantidade: Number(i?.quantidade),
    valorUnitario: Number(i?.valorUnitario),
  }));

/** "Itens do Pedido": Produto, Qtd, Unitário e Total (calculado), com Subtotal e Total. */
function ItensPedido() {
  const { control, formState } = useFormContext<PedidoCompraFormulario>();
  const { fields, append, remove } = useFieldArray({ control, name: 'itens' });
  const [itens, valorTotal] = useWatch({ control, name: ['itens', 'valorTotal'] });
  const linhas = paraTotal(itens);

  return (
    <div className="grid gap-3 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Itens do Pedido</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({ produtoId: '', quantidade: 1, valorUnitario: 0 })}
        >
          <PlusIcon aria-hidden />
          Adicionar Item
        </Button>
      </div>
      {fields.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhum item adicionado. Clique em &quot;Adicionar Item&quot; acima.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border text-sm">
            <table className="w-full min-w-xl">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Produto</th>
                  <th className="w-24 px-2 py-2 text-center font-medium">Qtd</th>
                  <th className="w-32 px-2 py-2 text-center font-medium">Unitario</th>
                  <th className="w-28 px-2 py-2 text-right font-medium">Total</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {fields.map((campo, indice) => (
                  <tr key={campo.id} className="border-t">
                    <td className="px-3 py-2">
                      <Controller
                        control={control}
                        name={`itens.${indice}.produtoId`}
                        render={({ field, fieldState }) => (
                          <div className="grid gap-1">
                            <EntitySelect
                              entidade="produtos"
                              value={field.value || null}
                              onChange={(id) => field.onChange(id ?? '')}
                              permitirLimpar={false}
                              placeholder="Selecione..."
                              placeholderBusca="Buscar produto…"
                              aria-label={`Produto do item ${indice + 1}`}
                              aria-invalid={fieldState.invalid}
                            />
                            {fieldState.error && (
                              <p role="alert" className="text-sm text-destructive">
                                {fieldState.error.message}
                              </p>
                            )}
                          </div>
                        )}
                      />
                    </td>
                    <td className="px-2 py-2 align-top">
                      <CelulaNumero
                        indice={indice}
                        campo="quantidade"
                        rotulo={`Quantidade do item ${indice + 1}`}
                      />
                    </td>
                    <td className="px-2 py-2 align-top">
                      <CelulaNumero
                        indice={indice}
                        campo="valorUnitario"
                        rotulo={`Valor unitário do item ${indice + 1}`}
                      />
                    </td>
                    <td className="px-2 py-2 text-right font-semibold whitespace-nowrap">
                      {formatarMoeda(
                        totalItemPedido(linhas[indice] ?? { quantidade: 0, valorUnitario: 0 }),
                      )}
                    </td>
                    <td className="px-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        aria-label={`Remover item ${indice + 1}`}
                        onClick={() => remove(indice)}
                      >
                        <Trash2Icon aria-hidden />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-2 rounded-lg bg-muted/50 p-4 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>
                Subtotal ({fields.length} {fields.length === 1 ? 'item' : 'itens'})
              </span>
              <span className="text-foreground">{formatarMoeda(subtotalPedidoCompra(linhas))}</span>
            </div>
            <div className="flex justify-between border-t pt-2 text-lg font-bold">
              <span>Total</span>
              <span className="text-emerald-700 dark:text-emerald-400">
                {formatarMoeda(valorTotalPedidoCompra(linhas, valorTotal))}
              </span>
            </div>
          </div>
        </>
      )}
      {formState.errors.itens?.message && (
        <p role="alert" className="text-sm text-destructive">
          {formState.errors.itens.message}
        </p>
      )}
    </div>
  );
}

/** Modal "Novo Pedido de Compra" e edição do pedido (só em trânsito). */
export function ModalPedido({ pedido, onFechar }: Readonly<ModalPedidoProps>) {
  const criar = useCriarPedidoCompra();
  const editar = useEditarPedidoCompra(pedido?.id ?? '');
  const form = useFormulario(pedidoCompraInputSchema, { defaultValues: valoresIniciais(pedido) });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={pedido ? 'Editar Pedido de Compra' : 'Novo Pedido de Compra'}
      tamanho="xl"
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={pedido ? 'Salvar' : 'Criar Pedido'}
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await (pedido ? editar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField
          name="fornecedorId"
          label="Fornecedor"
          tipo="entidade"
          entidade="fornecedores"
          placeholder="Selecione o fornecedor"
          obrigatorio
        />
        <div className="grid gap-4 sm:grid-cols-4">
          <FormField name="numeroNf" label="Numero NF" placeholder="000000" />
          <FormField name="dataPedido" label="Data Pedido" tipo="data" />
          <FormField name="dataPrevisao" label="Previsao Entrega" tipo="data" />
          <FormField name="valorTotal" label="Valor Total (R$)" tipo="moeda" placeholder="Auto" />
        </div>
        <FormField
          name="observacoes"
          label="Observacoes"
          tipo="textarea"
          placeholder="Observacoes sobre o pedido..."
        />
        <ItensPedido />
      </FormLayout>
    </Modal>
  );
}
