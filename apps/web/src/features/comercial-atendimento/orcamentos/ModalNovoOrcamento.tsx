import {
  calcularTotaisOrcamento,
  criarOrcamentoSchema,
  MSG_ORCAMENTO_SEM_ITENS,
  type CatalogoOrcamentoItem,
  type CriarOrcamentoFormulario,
  type OrcamentoDescontoTipo,
  type OrcamentoOrigem,
} from '@torres/shared';
import { FileTextIcon, Trash2Icon } from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { CatalogoItens } from './CatalogoItens';
import { useCriarOrcamento } from './use-orcamentos';

const ID_FORMULARIO = 'form-novo-orcamento';

const VALORES_INICIAIS: CriarOrcamentoFormulario = {
  pacienteId: null,
  formaPagamentoId: null,
  observacoes: '',
  descontoTipo: 'valor',
  descontoValor: 0,
  itens: [],
};

const numeroOuNull = (texto: string) => (texto === '' ? null : Number(texto));

type CampoNumerico = 'quantidade' | 'valorUnitario' | 'desconto';

interface CelulaNumeroProps {
  indice: number;
  campo: CampoNumerico;
  rotulo: string;
  className?: string;
}

function CelulaNumero({ indice, campo, rotulo, className }: Readonly<CelulaNumeroProps>) {
  const { control } = useFormContext<CriarOrcamentoFormulario>();
  return (
    <Controller
      control={control}
      name={`itens.${indice}.${campo}`}
      render={({ field, fieldState }) => (
        <Input
          type="number"
          min={campo === 'quantidade' ? 1 : 0}
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

/** Itens adicionados (Descrição, Qtd, Valor Un., Desc., Total) e os totais do orçamento. */
function ItensEscolhidos() {
  const { control, register, formState } = useFormContext<CriarOrcamentoFormulario>();
  const { fields, remove } = useFieldArray({ control, name: 'itens' });
  const [itens = [], descontoTipo = 'valor', descontoValor = 0] = useWatch({
    control,
    name: ['itens', 'descontoTipo', 'descontoValor'],
  });
  const totais = calcularTotaisOrcamento(
    itens.map((i) => ({
      quantidade: Number(i?.quantidade) || 0,
      valorUnitario: Number(i?.valorUnitario) || 0,
      desconto: Number(i?.desconto) || 0,
    })),
    descontoTipo,
    Number(descontoValor) || 0,
  );
  const erro = formState.errors.itens?.message ?? formState.errors.itens?.root?.message;

  return (
    <div className="grid gap-2">
      {fields.length > 0 && (
        <div className="overflow-x-auto rounded-lg border text-sm">
          <table className="w-full min-w-xl">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Descrição</th>
                <th className="w-20 px-2 py-2 text-center font-medium">Qtd</th>
                <th className="w-28 px-2 py-2 text-center font-medium">Valor Un.</th>
                <th className="w-24 px-2 py-2 text-center font-medium">Desc.</th>
                <th className="w-28 px-2 py-2 text-right font-medium">Total</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {fields.map((campo, indice) => {
                const total = totais.totaisItens[indice] ?? 0;
                return (
                  <tr key={campo.id} className="border-t">
                    <td className="px-3 py-2">
                      <Input
                        aria-label={`Descrição do item ${indice + 1}`}
                        aria-invalid={Boolean(formState.errors.itens?.[indice]?.descricao)}
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
                    <td className="px-2 py-2">
                      <CelulaNumero
                        indice={indice}
                        campo="desconto"
                        rotulo={`Desconto do item ${indice + 1}`}
                        className="text-center"
                      />
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
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
                );
              })}
            </tbody>
          </table>
          <dl className="grid gap-1 border-t bg-muted/30 px-3 py-2">
            <div className="flex justify-between">
              <dt>Subtotal:</dt>
              <dd>{formatarMoeda(totais.subtotal)}</dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt>Desconto:</dt>
              <dd className="flex gap-2">
                <Controller
                  control={control}
                  name="descontoTipo"
                  render={({ field }) => (
                    <Select
                      value={field.value ?? 'valor'}
                      onValueChange={(valor) => field.onChange(valor as OrcamentoDescontoTipo)}
                    >
                      <SelectTrigger size="sm" className="w-20" aria-label="Tipo de desconto">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="valor">R$</SelectItem>
                        <SelectItem value="percentual">%</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                <Controller
                  control={control}
                  name="descontoValor"
                  render={({ field, fieldState }) => (
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      className="h-8 w-28 text-center"
                      aria-label="Desconto geral"
                      aria-invalid={fieldState.invalid}
                      title={fieldState.error?.message}
                      value={field.value ?? ''}
                      onChange={(evento) => field.onChange(numeroOuNull(evento.target.value))}
                      onBlur={field.onBlur}
                    />
                  )}
                />
              </dd>
            </div>
            <div className="flex items-center justify-between border-t pt-2 text-base font-bold">
              <dt>TOTAL:</dt>
              <dd className="text-emerald-700 dark:text-emerald-400">
                {formatarMoeda(totais.total)}
              </dd>
            </div>
          </dl>
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

export interface ModalNovoOrcamentoProps {
  onFechar: () => void;
  /**
   * Paciente já definido (aba Orçamento do Atendimento Médico, #38): o campo "Cliente" some e o
   * orçamento é criado para ele.
   */
  pacienteId?: string;
}

/** "Novo Orçamento" (docs/inventario/telas/comercial-atendimento-orcamentos.md). */
export function ModalNovoOrcamento({ onFechar, pacienteId }: Readonly<ModalNovoOrcamentoProps>) {
  const criar = useCriarOrcamento();
  const form = useFormulario(criarOrcamentoSchema, {
    defaultValues: { ...VALORES_INICIAIS, pacienteId: pacienteId ?? null },
  });
  const { submitCount, isSubmitting } = form.formState;

  // Mesma mensagem do legado, em toast, ao tentar criar sem itens.
  useEffect(() => {
    if (submitCount > 0 && form.getFieldState('itens').error) {
      toast.error(MSG_ORCAMENTO_SEM_ITENS);
    }
    // Só quando o envio é recusado; os erros mudam junto com `submitCount`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitCount]);

  function adicionar(origem: OrcamentoOrigem, item: CatalogoOrcamentoItem) {
    const atuais = form.getValues('itens') ?? [];
    const existente = atuais.find((i) => i.origem === origem && i.origemId === item.id);
    // O mesmo item de novo só soma a quantidade.
    const itens = existente
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
            desconto: 0,
          },
        ];
    form.setValue('itens', itens, { shouldDirty: true, shouldValidate: submitCount > 0 });
  }

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Novo Orçamento"
      tamanho="xl"
      rodape={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form={ID_FORMULARIO}
            aria-disabled={isSubmitting}
            aria-busy={isSubmitting}
            onClick={(evento) => isSubmitting && evento.preventDefault()}
          >
            <FileTextIcon aria-hidden />
            Criar Orçamento
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
        {!pacienteId && (
          <FormField
            name="pacienteId"
            label="Cliente"
            tipo="entidade"
            entidade="pacientes"
            placeholder="Buscar paciente…"
          />
        )}
        <section aria-labelledby="titulo-itens" className="grid gap-2">
          <h3 id="titulo-itens" className="text-sm font-medium">
            Adicionar itens
          </h3>
          <CatalogoItens onAdicionar={adicionar} />
          <ItensEscolhidos />
        </section>
        <FormField
          name="formaPagamentoId"
          label="Forma de Pagamento"
          tipo="entidade"
          entidade="formas-pagamento"
          filtros={{ finalidade: 'receber' }}
          placeholder="Não definida"
          className="sm:max-w-md"
        />
        <FormField
          name="observacoes"
          label="Observações"
          tipo="textarea"
          placeholder="Observações, condições, validade…"
        />
      </FormLayout>
    </Modal>
  );
}
