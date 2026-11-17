import {
  abreviarDiaSemana,
  DIAS_SEMANA,
  mensagemAutomaticaInputSchema,
  type MensagemAutomatica,
  type MensagemAutomaticaFormulario,
} from '@torres/shared';
import { useState } from 'react';
import { useController, useFormContext } from 'react-hook-form';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { cn } from '@/lib/utils';
import { BotaoVisualizarClientes, CamposFiltro } from './CamposFiltro';
import { ModalDestinatarios } from './ModalDestinatarios';
import { AJUDA_VARIAVEIS, OPCOES_TIPO_ENVIO } from './textos';
import { useSalvarAutomacao, type FiltroConsulta } from './use-campanhas';

const ID_FORMULARIO = 'form-mensagem-automatica';
const TODOS_OS_DIAS = [0, 1, 2, 3, 4, 5, 6];

function valoresIniciais(automacao?: MensagemAutomatica): MensagemAutomaticaFormulario {
  return {
    nome: automacao?.nome ?? '',
    tipoEnvio: automacao?.tipoEnvio ?? 'TEXTO',
    canalId: automacao?.canalId ?? (null as unknown as string),
    filtro: automacao?.filtro ?? 'TODOS',
    origemClienteId: automacao?.origemClienteId ?? null,
    diasCompra: automacao?.diasCompra ?? null,
    horario: automacao?.horario ?? '',
    diasSemana: automacao?.diasSemana ?? TODOS_OS_DIAS,
    ativa: automacao?.ativa ?? true,
    mensagem: automacao?.mensagem ?? '',
  };
}

/** Dias da semana como botões de alternar ("Dom", "Seg"…). */
function CampoDiasSemana() {
  const { control } = useFormContext();
  const { field, fieldState } = useController({ control, name: 'diasSemana' });
  const dias = (field.value as number[] | undefined) ?? [];
  const alternar = (dia: number) =>
    field.onChange(dias.includes(dia) ? dias.filter((d) => d !== dia) : [...dias, dia]);
  return (
    <fieldset className="grid gap-2 sm:col-span-2" aria-describedby="dias-semana-erro">
      <legend className="mb-1 text-sm font-medium">
        Dias da semana <span className="text-destructive">*</span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {DIAS_SEMANA.map((nome, dia) => {
          const marcado = dias.includes(dia);
          return (
            <button
              key={nome}
              type="button"
              aria-pressed={marcado}
              title={nome}
              className={cn(
                'rounded-md border px-3 py-1.5 text-sm',
                marcado && 'border-primary bg-primary text-primary-foreground',
              )}
              onClick={() => alternar(dia)}
            >
              {abreviarDiaSemana(dia)}
            </button>
          );
        })}
      </div>
      {fieldState.error?.message && (
        <p id="dias-semana-erro" className="text-sm text-destructive">
          {fieldState.error.message}
        </p>
      )}
    </fieldset>
  );
}

export interface ModalMensagemAutomaticaProps {
  /** Sem automação: "Nova Automação". Com automação: "Editar Automação". */
  automacao?: MensagemAutomatica;
  onFechar: () => void;
}

/** Modal "Nova Automação": nome, envio, canal, filtro, horário, dias e mensagem. */
export function ModalMensagemAutomatica({
  automacao,
  onFechar,
}: Readonly<ModalMensagemAutomaticaProps>) {
  const salvar = useSalvarAutomacao(automacao?.id);
  const form = useFormulario(mensagemAutomaticaInputSchema, {
    defaultValues: valoresIniciais(automacao),
  });
  const [visualizando, setVisualizando] = useState<FiltroConsulta | null>(null);

  return (
    <>
      <Modal
        aberto
        tamanho="lg"
        onAbertoChange={(aberto) => aberto || onFechar()}
        titulo={automacao ? 'Editar Automação' : 'Nova Automação'}
        rodape={
          <FormAcoes
            form={form}
            formId={ID_FORMULARIO}
            rotuloEnviar={automacao ? 'Salvar' : 'Criar Automação'}
            onCancelar={onFechar}
          />
        }
      >
        <FormLayout
          id={ID_FORMULARIO}
          form={form}
          acoes={null}
          colunas={2}
          onSubmit={async (valores) => {
            await salvar.mutateAsync(valores);
            onFechar();
          }}
        >
          <FormField
            name="nome"
            label="Nome"
            placeholder="Ex: Aniversariantes do Dia"
            obrigatorio
            className="sm:col-span-2"
          />
          <FormField
            name="tipoEnvio"
            label="Tipo de Envio"
            tipo="select"
            opcoes={OPCOES_TIPO_ENVIO}
          />
          <FormField
            name="canalId"
            label="Canal WhatsApp"
            tipo="entidade"
            entidade="canais-whatsapp"
            placeholder="Selecione"
            obrigatorio
          />
          <CamposFiltro />
          <BotaoVisualizarClientes onVisualizar={setVisualizando} />
          <FormField name="horario" label="Horário" tipo="hora" obrigatorio />
          <FormField name="ativa" label="Ativa" tipo="switch" />
          <CampoDiasSemana />
          <FormField
            name="mensagem"
            label="Mensagem"
            tipo="textarea"
            placeholder="Digite a mensagem..."
            descricao={AJUDA_VARIAVEIS}
            obrigatorio
            className="sm:col-span-2"
          />
        </FormLayout>
      </Modal>
      {visualizando && (
        <ModalDestinatarios filtro={visualizando} onFechar={() => setVisualizando(null)} />
      )}
    </>
  );
}
