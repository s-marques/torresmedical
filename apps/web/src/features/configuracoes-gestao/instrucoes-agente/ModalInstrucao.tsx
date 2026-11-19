import {
  AGENTE_MAX_TOKENS_PADRAO,
  AGENTE_MODELO_RECOMENDADO,
  AGENTE_MODELO_RECOMENDADO_ROTULO,
  AGENTE_TEMPERATURA_PADRAO,
  createAgenteInstrucaoSchema,
  type AgenteInstrucao,
} from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/ui/button';
import { useSalvarInstrucao } from './use-instrucoes-agente';

const ID_FORMULARIO = 'form-agente-instrucao';

export interface ModalInstrucaoProps {
  /** Sem registro: "Nova Instrução". Com registro: "Editar Instrução". */
  registro?: AgenteInstrucao;
  onFechar: () => void;
}

/**
 * Modais "Nova Instrução" e "Editar Instrução" (inventário): Nome *, Modelo, Temperatura,
 * Max Tokens, Ativo e System Prompt *. "Ativo" só liga numa instrução publicada.
 */
export function ModalInstrucao({ registro, onFechar }: Readonly<ModalInstrucaoProps>) {
  const salvar = useSalvarInstrucao(registro?.id);
  const form = useFormulario(createAgenteInstrucaoSchema, {
    defaultValues: {
      nome: registro?.nome ?? '',
      modelo: registro?.modelo ?? AGENTE_MODELO_RECOMENDADO,
      temperatura: registro?.temperatura ?? AGENTE_TEMPERATURA_PADRAO,
      maxTokens: registro?.maxTokens ?? AGENTE_MAX_TOKENS_PADRAO,
      ativo: registro?.ativo ?? false,
      systemPrompt: registro?.systemPrompt ?? '',
    },
  });
  const publicada = registro?.status === 'PUBLICADO';

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={registro ? 'Editar Instrução' : 'Nova Instrução'}
      tamanho="lg"
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={registro ? 'Salvar' : 'Criar'}
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await salvar.mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField name="nome" label="Nome" obrigatorio />
        <div className="grid gap-2">
          <FormField name="modelo" label="Modelo" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() =>
              form.setValue('modelo', AGENTE_MODELO_RECOMENDADO, { shouldDirty: true })
            }
          >
            {AGENTE_MODELO_RECOMENDADO_ROTULO}
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="temperatura" label="Temperatura" tipo="numero" />
          <FormField name="maxTokens" label="Max Tokens" tipo="numero" />
        </div>
        <FormField
          name="ativo"
          label="Ativo"
          tipo="switch"
          disabled={!publicada}
          descricao={
            publicada
              ? undefined
              : 'Só uma instrução publicada pode ficar ativa. Alterar o conteúdo volta o status para rascunho.'
          }
        />
        <FormField
          name="systemPrompt"
          label="System Prompt / Instrução"
          tipo="textarea"
          obrigatorio
          className="[&_textarea]:min-h-48 [&_textarea]:font-mono"
        />
      </FormLayout>
    </Modal>
  );
}
