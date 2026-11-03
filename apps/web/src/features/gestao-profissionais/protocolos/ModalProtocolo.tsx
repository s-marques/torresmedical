import {
  createProtocoloSchema,
  PROTOCOLO_TIPO_ROTULOS,
  PROTOCOLO_TIPOS,
  type Protocolo,
  type ProtocoloFormulario,
} from '@torres/shared';
import { PackageIcon, XIcon } from 'lucide-react';
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
import { useAlterarProtocolo, useCriarProtocolo } from './use-protocolos';

const ID_FORMULARIO = 'form-protocolo';

const OPCOES_TIPO = PROTOCOLO_TIPOS.map((valor) => ({
  valor,
  rotulo: PROTOCOLO_TIPO_ROTULOS[valor],
}));

function valoresIniciais(protocolo?: Protocolo): ProtocoloFormulario {
  return {
    nome: protocolo?.nome ?? '',
    tipo: protocolo?.tipo ?? 'procedimento',
    categoria: protocolo?.categoria ?? 'Geral',
    profissionalId: protocolo?.profissionalId ?? null,
    totalSemanas: protocolo?.totalSemanas ?? 1,
    valorTotal: protocolo?.valorTotal ?? 0,
    observacoes: protocolo?.observacoes ?? '',
    itens:
      protocolo?.itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade })) ?? [],
  };
}

interface ItensProtocoloProps {
  nomes: Readonly<Record<string, string>>;
  onNome: (id: string, nome: string) => void;
}

/** "Itens do Protocolo (composição)": busca de produto/procedimento e tabela com quantidade. */
function ItensProtocolo({ nomes, onNome }: Readonly<ItensProtocoloProps>) {
  const { control, formState } = useFormContext<ProtocoloFormulario>();
  const { fields, append, remove } = useFieldArray({ control, name: 'itens' });
  const erro = formState.errors.itens?.message ?? formState.errors.itens?.root?.message;

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <PackageIcon aria-hidden className="size-4" />
        <span id="rotulo-itens-protocolo">Itens do Protocolo (composição)</span>
      </div>
      <EntitySelect
        entidade="produtos"
        value={null}
        permitirLimpar={false}
        placeholder="Buscar produto/procedimento para adicionar…"
        placeholderBusca="Buscar produto/procedimento…"
        aria-labelledby="rotulo-itens-protocolo"
        onChange={(id, item) => {
          if (!id || !item) return;
          onNome(id, item.label);
          if (!fields.some((campo) => campo.produtoId === id)) {
            append({ produtoId: id, quantidade: 1 });
          }
        }}
      />
      {fields.length > 0 && (
        <table className="w-full overflow-hidden rounded-lg border text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Produto/Serviço</th>
              <th className="w-28 px-3 py-2 text-center font-medium">Qtd</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {fields.map((campo, indice) => {
              const nome = nomes[campo.produtoId] ?? 'Produto/Serviço';
              return (
                <tr key={campo.id} className="border-t">
                  <td className="px-3 py-2">{nome}</td>
                  <td className="px-3 py-2">
                    <Controller
                      control={control}
                      name={`itens.${indice}.quantidade`}
                      render={({ field }) => (
                        <Input
                          type="number"
                          min={1}
                          className="h-8 text-center"
                          aria-label={`Quantidade de ${nome}`}
                          value={field.value ?? ''}
                          onChange={(evento) =>
                            field.onChange(
                              evento.target.value === '' ? null : Number(evento.target.value),
                            )
                          }
                          onBlur={field.onBlur}
                        />
                      )}
                    />
                  </td>
                  <td className="px-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      aria-label={`Remover ${nome}`}
                      onClick={() => remove(indice)}
                    >
                      <XIcon aria-hidden />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}

export interface ModalProtocoloProps {
  /** Sem protocolo: "Novo Protocolo". Com protocolo: "Editar Protocolo". */
  protocolo?: Protocolo;
  onFechar: () => void;
}

export function ModalProtocolo({ protocolo, onFechar }: Readonly<ModalProtocoloProps>) {
  const criar = useCriarProtocolo();
  const alterar = useAlterarProtocolo(protocolo?.id ?? '');
  const form = useFormulario(createProtocoloSchema, { defaultValues: valoresIniciais(protocolo) });
  const [nomes, setNomes] = useState<Record<string, string>>(() =>
    Object.fromEntries(protocolo?.itens.map((i) => [i.produtoId, i.produtoNome]) ?? []),
  );

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={protocolo ? 'Editar Protocolo' : 'Novo Protocolo'}
      tamanho="lg"
      rodape={
        <FormAcoes form={form} formId={ID_FORMULARIO} rotuloEnviar="Salvar" onCancelar={onFechar} />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        colunas={3}
        onSubmit={async (valores) => {
          await (protocolo ? alterar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField name="nome" label="Nome" obrigatorio className="col-span-full" />
        <FormField name="tipo" label="Tipo" tipo="select" opcoes={OPCOES_TIPO} />
        <FormField name="categoria" label="Categoria" placeholder="Geral" />
        <FormField
          name="profissionalId"
          label="Profissional"
          tipo="entidade"
          entidade="profissionais"
        />
        <FormField name="totalSemanas" label="Total de Semanas" tipo="numero" />
        <FormField name="valorTotal" label="Valor Total do Protocolo (R$)" tipo="moeda" />
        <div className="col-span-full">
          <ItensProtocolo
            nomes={nomes}
            onNome={(id, nome) => setNomes((atual) => ({ ...atual, [id]: nome }))}
          />
        </div>
        <FormField
          name="observacoes"
          label="Observações (opcional)"
          tipo="textarea"
          placeholder="Orientações, instruções adicionais…"
          className="col-span-full"
        />
      </FormLayout>
    </Modal>
  );
}
