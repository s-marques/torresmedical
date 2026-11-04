import {
  calcularTotaisVenda,
  criarVendaSchema,
  type CatalogoVendaItem,
  type CriarVendaFormulario,
  type VendaOrigem,
} from '@torres/shared';
import { ClipboardListIcon, SearchIcon, ShoppingCartIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { Controller, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/use-debounce';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { cn } from '@/lib/utils';
import { CATALOGO_TAMANHO, useCatalogoVenda, useCriarVenda } from './use-vendas';

const ID_FORMULARIO = 'form-pdv';
const ATRASO_BUSCA_MS = 300;

const VALORES_INICIAIS: CriarVendaFormulario = {
  pacienteId: null,
  formaPagamentoId: null,
  parcelas: 1,
  desconto: 0,
  itens: [],
};

const numeroOuNull = (texto: string) => (texto === '' ? null : Number(texto));

interface BuscaItensProps {
  onAdicionar: (origem: VendaOrigem, item: CatalogoVendaItem) => void;
}

/** Campo "Buscar produto ou serviço…" e botão "Protocolo", com a lista de resultados. */
function BuscaItens({ onAdicionar }: Readonly<BuscaItensProps>) {
  const [tipo, setTipo] = useState<VendaOrigem>('produto');
  const [busca, setBusca] = useState('');
  const termo = useDebounce(busca.trim(), ATRASO_BUSCA_MS);
  const protocolos = tipo === 'protocolo';
  // Produtos só listam depois de digitar; protocolos listam ao abrir o botão.
  const mostrar = protocolos || termo !== '';
  const catalogo = useCatalogoVenda(tipo, termo, mostrar);
  const itens = mostrar ? (catalogo.data?.data ?? []) : [];
  const rotulo = protocolos ? 'Buscar protocolo…' : 'Buscar produto ou serviço…';

  return (
    <div className="grid gap-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            className="pl-9"
            placeholder={rotulo}
            aria-label={rotulo}
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          aria-pressed={protocolos}
          onClick={() => setTipo(protocolos ? 'produto' : 'protocolo')}
        >
          <ClipboardListIcon aria-hidden />
          Protocolo
        </Button>
      </div>
      {mostrar && (
        <ul
          aria-label={protocolos ? 'Protocolos' : 'Produtos e serviços'}
          className="max-h-48 divide-y overflow-y-auto rounded-lg border text-sm"
        >
          {itens.length === 0 && (
            <li className="px-3 py-4 text-center text-muted-foreground">
              {catalogo.isPending
                ? 'Carregando…'
                : `Nenhum ${protocolos ? 'protocolo' : 'produto ou serviço'} encontrado`}
            </li>
          )}
          {itens.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-3 py-2 text-left',
                  'hover:bg-muted focus-visible:bg-muted focus-visible:outline-none',
                )}
                onClick={() => onAdicionar(tipo, item)}
              >
                <span>
                  {item.nome}
                  {item.detalhe && (
                    <span className="ml-1 text-xs text-muted-foreground uppercase">
                      ({item.detalhe})
                    </span>
                  )}
                </span>
                <span className="font-medium whitespace-nowrap text-emerald-700 dark:text-emerald-400">
                  {formatarMoeda(item.valor)}
                </span>
              </button>
            </li>
          ))}
          {catalogo.data && catalogo.data.meta.total > CATALOGO_TAMANHO && (
            <li className="px-3 py-2 text-center text-xs text-muted-foreground">
              Mostrando {CATALOGO_TAMANHO} de {catalogo.data.meta.total}. Refine a busca.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Itens adicionados (descrição, quantidade, valor e total de cada um). */
function ItensDaVenda() {
  const { control, formState } = useFormContext<CriarVendaFormulario>();
  const { fields, remove } = useFieldArray({ control, name: 'itens' });
  const itens = useWatch({ control, name: 'itens' }) ?? [];
  const erro = formState.errors.itens?.message ?? formState.errors.itens?.root?.message;

  return (
    <div className="grid gap-2">
      {fields.length > 0 && (
        <ul aria-label="Itens da venda" className="divide-y rounded-lg border text-sm">
          {fields.map((campo, indice) => {
            const item = itens[indice];
            const total = (Number(item?.quantidade) || 0) * (Number(item?.valorUnitario) || 0);
            return (
              <li key={campo.id} className="flex items-center gap-3 px-3 py-2">
                <span className="flex-1">{campo.descricao}</span>
                <Controller
                  control={control}
                  name={`itens.${indice}.quantidade`}
                  render={({ field, fieldState }) => (
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      className="h-8 w-20 text-center"
                      aria-label={`Quantidade do item ${indice + 1}`}
                      aria-invalid={fieldState.invalid}
                      title={fieldState.error?.message}
                      value={field.value ?? ''}
                      onChange={(evento) => field.onChange(numeroOuNull(evento.target.value))}
                      onBlur={field.onBlur}
                    />
                  )}
                />
                <span className="w-24 text-right text-muted-foreground">
                  {formatarMoeda(Number(campo.valorUnitario))}
                </span>
                <span className="w-24 text-right font-medium">{formatarMoeda(total)}</span>
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
              </li>
            );
          })}
        </ul>
      )}
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}

function Resumo() {
  const { control } = useFormContext<CriarVendaFormulario>();
  const [itens = [], desconto = 0] = useWatch({ control, name: ['itens', 'desconto'] });
  const totais = calcularTotaisVenda(
    itens.map((i) => ({
      quantidade: Number(i?.quantidade) || 0,
      valorUnitario: Number(i?.valorUnitario) || 0,
    })),
    Number(desconto) || 0,
  );
  return (
    <dl className="grid gap-2 rounded-lg bg-muted/50 px-4 py-3 text-sm">
      <div className="flex justify-between">
        <dt>Subtotal:</dt>
        <dd>{formatarMoeda(totais.subtotal)}</dd>
      </div>
      <div className="flex items-center justify-between border-t pt-2 text-base font-bold">
        <dt>Total:</dt>
        <dd className="text-xl text-emerald-700 dark:text-emerald-400">
          {formatarMoeda(totais.total)}
        </dd>
      </div>
    </dl>
  );
}

/** "Ponto de Venda (PDV)": prints enviados pelo dev no card #15. */
export function ModalPdv({ onFechar }: Readonly<{ onFechar: () => void }>) {
  const criar = useCriarVenda();
  const form = useFormulario(criarVendaSchema, { defaultValues: VALORES_INICIAIS });
  const { isSubmitting } = form.formState;
  const itens = useWatch({ control: form.control, name: 'itens' }) ?? [];

  function adicionar(origem: VendaOrigem, item: CatalogoVendaItem) {
    const atuais = form.getValues('itens') ?? [];
    const existente = atuais.find((i) => i.origem === origem && i.origemId === item.id);
    // O mesmo item de novo só soma a quantidade.
    const novos = existente
      ? atuais.map((i) =>
          i === existente ? { ...i, quantidade: (Number(i.quantidade) || 0) + 1 } : i,
        )
      : [
          ...atuais,
          {
            origem,
            origemId: item.id,
            descricao: item.nome,
            quantidade: 1,
            valorUnitario: item.valor,
          },
        ];
    form.setValue('itens', novos, {
      shouldDirty: true,
      shouldValidate: form.formState.submitCount > 0,
    });
  }

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Ponto de Venda (PDV)"
      tamanho="lg"
      rodape={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form={ID_FORMULARIO}
            disabled={itens.length === 0}
            aria-busy={isSubmitting}
            onClick={(evento) => isSubmitting && evento.preventDefault()}
          >
            <ShoppingCartIcon aria-hidden />
            Finalizar Venda
          </Button>
        </div>
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await criar.mutateAsync(valores);
          onFechar();
        }}
      >
        <BuscaItens onAdicionar={adicionar} />
        <ItensDaVenda />
        <FormField
          name="pacienteId"
          label="Cliente (opcional)"
          tipo="entidade"
          entidade="pacientes"
          placeholder="Buscar cliente…"
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            name="formaPagamentoId"
            label="Forma de pagamento"
            tipo="entidade"
            entidade="formas-pagamento"
            filtros={{ finalidade: 'receber' }}
            placeholder="Selecione"
          />
          <FormField name="parcelas" label="Parcelas" tipo="numero" />
          <FormField name="desconto" label="Desconto (R$)" tipo="numero" />
        </div>
        <Resumo />
      </FormLayout>
    </Modal>
  );
}
