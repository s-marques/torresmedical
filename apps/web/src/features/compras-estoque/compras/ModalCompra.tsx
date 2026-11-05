import {
  acceptDoUso,
  compraInputSchema,
  totalCompra,
  validarArquivo,
  type Compra,
  type CompraFormulario,
  type CompraXmlPrevia,
  type Produto,
} from '@torres/shared';
import { PlusIcon, SearchIcon, Trash2Icon } from 'lucide-react';
import { useRef, useState } from 'react';
import { Controller, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { EntitySelect } from '@/components/shared/EntitySelect';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { mensagemDoErroDeUpload, uploadArquivo } from '@/lib/api/upload-arquivo';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { usePlanoContas } from '../../financeiro/plano-contas/use-plano-contas';
import { ModalProduto } from '../produtos-servicos/ModalProduto';
import { useCriarCompra, useEditarCompra } from './use-compras';

const ID_FORMULARIO = 'form-compra';
const USO_NF = 'nota-fiscal-compra';
const SEM_CONTA = '__sem-conta__';

export interface ModalCompraProps {
  /** Com compra: edição. */
  compra?: Compra;
  /** Dados lidos do XML da NF-e: abre "Nova Compra" já preenchida. */
  previa?: CompraXmlPrevia;
  onFechar: () => void;
}

const hoje = () => new Date().toISOString().slice(0, 10);

function valoresIniciais(compra?: Compra, previa?: CompraXmlPrevia): CompraFormulario {
  if (compra) {
    return {
      fornecedorId: compra.fornecedorId,
      numeroNf: compra.numeroNf ?? '',
      serieNf: compra.serieNf ?? '',
      dataEmissao: compra.dataEmissao ?? '',
      dataEntrada: compra.dataEntrada,
      frete: Number(compra.frete),
      desconto: Number(compra.desconto),
      observacoes: compra.observacoes ?? '',
      arquivoNfId: compra.arquivoNfId,
      itens: compra.itens.map((i) => ({
        produtoId: i.produtoId,
        descricao: i.descricao,
        quantidade: Number(i.quantidade),
        valorUnitario: Number(i.valorUnitario),
        planoContaId: i.planoContaId,
      })),
    };
  }
  return {
    fornecedorId: previa?.fornecedorId ?? '',
    numeroNf: previa?.numeroNf ?? '',
    serieNf: previa?.serieNf ?? '',
    dataEmissao: previa?.dataEmissao ?? '',
    dataEntrada: hoje(),
    frete: previa?.frete ?? 0,
    desconto: previa?.desconto ?? 0,
    observacoes: '',
    arquivoNfId: null,
    itens: (previa?.itens ?? []).map((i) => ({
      produtoId: i.produtoId ?? '',
      descricao: i.codigo ? `${i.codigo} - ${i.descricao}` : i.descricao,
      quantidade: i.quantidade,
      valorUnitario: i.valorUnitario,
      planoContaId: null,
    })),
  };
}

const numeroOuNull = (texto: string) => (texto === '' ? null : Number(texto));

type CampoNumerico = 'quantidade' | 'valorUnitario';

function CelulaNumero({
  indice,
  campo,
  rotulo,
  className,
}: Readonly<{ indice: number; campo: CampoNumerico; rotulo: string; className?: string }>) {
  const { control } = useFormContext<CompraFormulario>();
  return (
    <Controller
      control={control}
      name={`itens.${indice}.${campo}`}
      render={({ field, fieldState }) => (
        <Input
          type="number"
          min={0}
          step={campo === 'quantidade' ? 1 : 0.01}
          className={className}
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

interface OpcaoConta {
  valor: string;
  rotulo: string;
}

function SelectConta({
  indice,
  opcoes,
}: Readonly<{ indice: number; opcoes: readonly OpcaoConta[] }>) {
  const { control } = useFormContext<CompraFormulario>();
  return (
    <Controller
      control={control}
      name={`itens.${indice}.planoContaId`}
      render={({ field }) => (
        <Select
          value={field.value ?? SEM_CONTA}
          onValueChange={(valor) => field.onChange(valor === SEM_CONTA ? null : valor)}
        >
          <SelectTrigger
            size="sm"
            className="w-full text-muted-foreground"
            aria-label={`Conta contábil do item ${indice + 1}`}
          >
            <SelectValue placeholder="Conta contábil (opcional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_CONTA}>Conta contábil (opcional)</SelectItem>
            {opcoes.map((o) => (
              <SelectItem key={o.valor} value={o.valor}>
                {o.rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  );
}

/** Tabela de itens (Descrição, Qtd, Unitário, Total) com a conta contábil de cada item. */
function ItensCompra() {
  const { control, register, formState } = useFormContext<CompraFormulario>();
  const { fields, remove } = useFieldArray({ control, name: 'itens' });
  const planoContas = usePlanoContas({ search: '' });
  const opcoesConta = (planoContas.data?.data ?? []).map((c) => ({
    valor: c.id,
    rotulo: `${c.codigo} - ${c.nome}`,
  }));
  const itens = useWatch({ control, name: 'itens' }) ?? [];
  const erro = formState.errors.itens?.message ?? formState.errors.itens?.root?.message;

  return (
    <div className="grid gap-2">
      {fields.length > 0 && (
        <div className="overflow-x-auto rounded-lg border text-sm">
          <table className="w-full min-w-xl">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Descricao</th>
                <th className="w-20 px-2 py-2 text-center font-medium">Qtd</th>
                <th className="w-28 px-2 py-2 text-center font-medium">Unitario</th>
                <th className="w-28 px-2 py-2 text-right font-medium">Total</th>
                <th className="w-10" />
              </tr>
            </thead>
            {fields.map((campo, indice) => {
              const item = itens[indice];
              const total = totalCompra(
                [
                  {
                    quantidade: Number(item?.quantidade),
                    valorUnitario: Number(item?.valorUnitario),
                  },
                ],
                0,
                0,
              );
              const erroItem = formState.errors.itens?.[indice];
              return (
                <tbody key={campo.id} className="border-t">
                  <tr>
                    <td className="px-3 py-2">
                      <Input
                        aria-label={`Descrição do item ${indice + 1}`}
                        aria-invalid={Boolean(erroItem?.descricao)}
                        {...register(`itens.${indice}.descricao`)}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <CelulaNumero
                        indice={indice}
                        campo="quantidade"
                        rotulo={`Quantidade do item ${indice + 1}`}
                        className="text-center"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <CelulaNumero
                        indice={indice}
                        campo="valorUnitario"
                        rotulo={`Valor unitário do item ${indice + 1}`}
                        className="text-center"
                      />
                    </td>
                    <td className="px-2 py-2 text-right font-semibold whitespace-nowrap">
                      {formatarMoeda(total)}
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
                  <tr>
                    <td colSpan={5} className="grid gap-2 px-3 pb-3 sm:grid-cols-2">
                      <SelectConta indice={indice} opcoes={opcoesConta} />
                      {!item?.produtoId && (
                        <Controller
                          control={control}
                          name={`itens.${indice}.produtoId`}
                          render={({ field, fieldState }) => (
                            <div className="grid gap-1">
                              <EntitySelect
                                entidade="produtos"
                                value={field.value}
                                onChange={(id) => field.onChange(id ?? '')}
                                permitirLimpar={false}
                                placeholder="Vincular produto *"
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
                      )}
                    </td>
                  </tr>
                </tbody>
              );
            })}
          </table>
        </div>
      )}
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}

/** Total da compra: itens + frete - desconto. */
function TotalCompra() {
  const { control } = useFormContext<CompraFormulario>();
  const [itens = [], frete, desconto] = useWatch({ control, name: ['itens', 'frete', 'desconto'] });
  const total = totalCompra(
    itens.map((i) => ({
      quantidade: Number(i?.quantidade),
      valorUnitario: Number(i?.valorUnitario),
    })),
    frete,
    desconto,
  );
  return (
    <p className="text-right text-base font-bold">
      Total: <span className="text-emerald-700 dark:text-emerald-400">{formatarMoeda(total)}</span>
    </p>
  );
}

/** Modal "Nova Compra (Entrada)" e edição da compra. */
export function ModalCompra({ compra, previa, onFechar }: Readonly<ModalCompraProps>) {
  const [novoProduto, setNovoProduto] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const criar = useCriarCompra();
  const editar = useEditarCompra(compra?.id ?? '');
  const form = useFormulario(compraInputSchema, { defaultValues: valoresIniciais(compra, previa) });
  const semFornecedor = previa && !previa.fornecedorId;

  function adicionar(produtoId: string, descricao: string, valorUnitario = 0) {
    const atuais = form.getValues('itens') ?? [];
    const existente = atuais.find((i) => i.produtoId === produtoId);
    // O mesmo produto de novo só soma a quantidade.
    const itens = existente
      ? atuais.map((i) =>
          i === existente ? { ...i, quantidade: (Number(i.quantidade) || 0) + 1 } : i,
        )
      : [...atuais, { produtoId, descricao, quantidade: 1, valorUnitario, planoContaId: null }];
    form.setValue('itens', itens, {
      shouldDirty: true,
      shouldValidate: form.formState.submitCount > 0,
    });
  }

  function adicionarCadastrado(produto: Produto) {
    adicionar(produto.id, produto.nome, Number(produto.precoCusto ?? 0));
  }

  function selecionarArquivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const selecionado = evento.target.files?.[0];
    if (!selecionado) return;
    const invalido = validarArquivo(
      { nome: selecionado.name, tipo: selecionado.type, tamanho: selecionado.size },
      USO_NF,
    );
    if (invalido) {
      toast.error(invalido);
      if (entrada.current) entrada.current.value = '';
      return;
    }
    setArquivo(selecionado);
  }

  return (
    <>
      <Modal
        aberto
        onAbertoChange={(aberto) => aberto || onFechar()}
        titulo={compra ? 'Editar Compra' : 'Nova Compra (Entrada)'}
        tamanho="xl"
        rodape={
          <FormAcoes
            form={form}
            formId={ID_FORMULARIO}
            rotuloEnviar={compra ? 'Salvar' : 'Registrar Compra'}
            onCancelar={onFechar}
          />
        }
      >
        <FormLayout
          id={ID_FORMULARIO}
          form={form}
          acoes={null}
          onSubmit={async (valores) => {
            let arquivoNfId = valores.arquivoNfId;
            if (arquivo) {
              try {
                arquivoNfId = (await uploadArquivo({ uso: USO_NF, arquivo })).id;
              } catch (erro) {
                toast.error(mensagemDoErroDeUpload(erro));
                return;
              }
            }
            await (compra ? editar : criar).mutateAsync({ ...valores, arquivoNfId });
            onFechar();
          }}
        >
          <FormField
            name="fornecedorId"
            label="Fornecedor"
            tipo="entidade"
            entidade="fornecedores"
            placeholder="Buscar fornecedor..."
            obrigatorio
            descricao={
              semFornecedor
                ? `Fornecedor da nota (${previa.fornecedorNome ?? 'sem nome'}${previa.fornecedorDocumento ? `, ${previa.fornecedorDocumento}` : ''}) não está cadastrado. Selecione um fornecedor.`
                : undefined
            }
          />
          <div className="grid gap-4 sm:grid-cols-4">
            <FormField name="numeroNf" label="Numero NF" />
            <FormField name="serieNf" label="Serie NF" placeholder="1" />
            <FormField name="dataEmissao" label="Data Emissao" tipo="data" />
            <FormField name="dataEntrada" label="Data Entrada" tipo="data" />
          </div>
          <div className="grid gap-3 border-t pt-4">
            <div className="grid gap-2">
              <Label className="sr-only">Buscar produto para adicionar</Label>
              <div className="relative">
                <SearchIcon
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <EntitySelect
                  entidade="produtos"
                  value={null}
                  onChange={(id, item) => id && item && adicionar(id, item.label)}
                  permitirLimpar={false}
                  placeholder="Buscar produto para adicionar..."
                  placeholderBusca="Buscar produto…"
                  aria-label="Buscar produto para adicionar"
                  className="pl-9"
                />
              </div>
            </div>
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setNovoProduto(true)}
              >
                <PlusIcon aria-hidden />
                Novo Produto (cadastrar na entrada)
              </Button>
            </div>
            <ItensCompra />
          </div>
          <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
            <FormField name="frete" label="Frete (R$)" tipo="moeda" />
            <FormField name="desconto" label="Desconto (R$)" tipo="moeda" />
          </div>
          <FormField
            name="observacoes"
            label="Observacoes"
            tipo="textarea"
            placeholder="Observacoes sobre a compra..."
          />
          <div className="grid gap-2">
            <Label htmlFor="arquivo-nf">Arquivo da NF (PDF ou imagem)</Label>
            <input
              ref={entrada}
              id="arquivo-nf"
              type="file"
              accept={acceptDoUso(USO_NF)}
              onChange={selecionarArquivo}
              className="rounded-md border px-3 py-2 text-sm"
            />
            {arquivo && <p className="text-sm text-muted-foreground">{arquivo.name}</p>}
          </div>
          <TotalCompra />
        </FormLayout>
      </Modal>
      {/* Fora do Modal da compra: o submit do produto não pode subir para o formulário da compra. */}
      {novoProduto && (
        <ModalProduto onFechar={() => setNovoProduto(false)} onSalvo={adicionarCadastrado} />
      )}
    </>
  );
}
