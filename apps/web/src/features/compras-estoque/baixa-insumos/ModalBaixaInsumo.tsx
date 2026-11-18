import { baixaInsumoInputSchema, type BaixaInsumoFormulario } from '@torres/shared';
import { SearchIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { Controller, useFieldArray, useFormContext } from 'react-hook-form';
import { EntitySelect } from '@/components/shared/EntitySelect';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRegistrarBaixaInsumo } from './use-baixas-insumos';

const ID_FORMULARIO = 'form-baixa-insumo';

const VALORES_INICIAIS: BaixaInsumoFormulario = {
  pacienteId: null,
  profissionalId: null,
  unidadeId: null,
  pressaoArterial: '',
  dextro: '',
  observacao: '',
  itens: [],
};

const numeroOuNull = (texto: string) => (texto === '' ? null : Number(texto));

interface ItensBaixaProps {
  /** Nome do insumo por id, guardado ao adicionar (o formulário só tem o id). */
  nomes: ReadonlyMap<string, string>;
}

/** Insumos escolhidos: nome, quantidade e remover. */
function ItensBaixa({ nomes }: Readonly<ItensBaixaProps>) {
  const { control, formState } = useFormContext<BaixaInsumoFormulario>();
  const { fields, remove } = useFieldArray({ control, name: 'itens' });
  const erro = formState.errors.itens?.message ?? formState.errors.itens?.root?.message;

  return (
    <div className="grid gap-2">
      {fields.map((campo, indice) => (
        <div key={campo.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate font-medium">
            {nomes.get(campo.produtoId) ?? 'Insumo'}
          </span>
          <Controller
            control={control}
            name={`itens.${indice}.quantidade`}
            render={({ field, fieldState }) => (
              <Input
                type="number"
                min={1}
                step={1}
                className="w-24 text-center"
                aria-label={`Quantidade do insumo ${indice + 1}`}
                aria-invalid={fieldState.invalid}
                title={fieldState.error?.message}
                value={field.value ?? ''}
                onChange={(evento) => field.onChange(numeroOuNull(evento.target.value))}
                onBlur={field.onBlur}
              />
            )}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-destructive hover:text-destructive"
            aria-label={`Remover insumo ${indice + 1}`}
            onClick={() => remove(indice)}
          >
            <Trash2Icon aria-hidden />
          </Button>
        </div>
      ))}
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}

function BuscaInsumo({
  jaAdicionados,
  onAdicionar,
}: Readonly<{
  jaAdicionados: ReadonlySet<string>;
  onAdicionar: (id: string, nome: string) => void;
}>) {
  return (
    <div className="grid gap-2">
      <Label className="sr-only">Buscar insumo</Label>
      <div className="relative">
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <EntitySelect
          entidade="produtos"
          filtros={{ tipo: 'produto' }}
          value={null}
          onChange={(id, item) => {
            if (id && item && !jaAdicionados.has(id)) onAdicionar(id, item.label);
          }}
          permitirLimpar={false}
          placeholder="Buscar insumo..."
          placeholderBusca="Buscar insumo…"
          aria-label="Buscar insumo"
          className="pl-9"
        />
      </div>
    </div>
  );
}

/**
 * Modal "Nova Baixa de Insumos" (print `compras-estoque-baixa-de-insumos--nova-baixa.jpg`):
 * Paciente, Profissional, Unidade, Pressão Arterial, Dextro (Glicemia), insumos com quantidade e
 * Observação; botões Cancelar e Registrar Baixa. Paciente, profissional e unidade são opcionais
 * e a quantidade é inteira (decisões da IA aceitas pelo dev na issue #17).
 */
export function ModalBaixaInsumo({ onFechar }: Readonly<{ onFechar: () => void }>) {
  const registrar = useRegistrarBaixaInsumo();
  const form = useFormulario(baixaInsumoInputSchema, { defaultValues: VALORES_INICIAIS });
  const [nomes, setNomes] = useState<ReadonlyMap<string, string>>(new Map());
  const itens = form.watch('itens') ?? [];

  const adicionar = (produtoId: string, nome: string) => {
    setNomes((atual) => new Map(atual).set(produtoId, nome));
    form.setValue('itens', [...itens, { produtoId, quantidade: 1 }], { shouldValidate: false });
  };

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Nova Baixa de Insumos"
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar="Registrar Baixa"
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await registrar.mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField
          name="pacienteId"
          label="Paciente"
          tipo="entidade"
          entidade="pacientes"
          placeholder="Digite o nome do paciente..."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            name="profissionalId"
            label="Profissional"
            tipo="entidade"
            entidade="profissionais"
            placeholder="Selecione..."
          />
          <FormField
            name="unidadeId"
            label="Unidade"
            tipo="entidade"
            entidade="unidades"
            placeholder="Selecione..."
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="pressaoArterial" label="Pressão Arterial" placeholder="Ex: 120/80" />
          <FormField name="dextro" label="Dextro (Glicemia)" placeholder="Ex: 95" />
        </div>
        <div className="grid gap-3 border-t pt-4">
          <Label>Insumos</Label>
          <BuscaInsumo
            jaAdicionados={new Set(itens.map((i) => i.produtoId))}
            onAdicionar={adicionar}
          />
          <ItensBaixa nomes={nomes} />
        </div>
        <FormField name="observacao" label="Observação" tipo="textarea" />
      </FormLayout>
    </Modal>
  );
}
