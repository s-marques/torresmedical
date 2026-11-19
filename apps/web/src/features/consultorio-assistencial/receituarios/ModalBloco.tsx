import { receituarioBlocoInputSchema, type ReceituarioBlocoFormulario } from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { OPCOES_TIPO } from './opcoes';
import { useCriarBloco } from './use-receituarios';

const ID_FORMULARIO = 'form-bloco-receituario';

const VALORES_INICIAIS: ReceituarioBlocoFormulario = {
  tipo: 'AMARELA',
  numeroInicio: null as unknown as number,
  numeroFim: null as unknown as number,
  localizacao: '',
  profissionalId: null,
  dataRecebimento: '',
};

/**
 * Modal "Novo Bloco de Receituario" (prints `consultorio-assistencial-receituarios--novo-bloco.jpg`
 * e do dev na issue #42): Tipo, Numero Inicio, Numero Fim, Localizacao, Medico e Data
 * Recebimento; botões Cancelar e Cadastrar. "ID do Medico" virou o select de profissional
 * (decisão do dev na issue #42).
 */
export function ModalBloco({ onFechar }: Readonly<{ onFechar: () => void }>) {
  const criar = useCriarBloco();
  const form = useFormulario(receituarioBlocoInputSchema, { defaultValues: VALORES_INICIAIS });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Novo Bloco de Receituario"
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar="Cadastrar"
          onCancelar={onFechar}
        />
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
        <FormField name="tipo" label="Tipo" tipo="select" opcoes={OPCOES_TIPO} obrigatorio />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            name="numeroInicio"
            label="Numero Inicio"
            tipo="numero"
            placeholder="000001"
            obrigatorio
          />
          <FormField
            name="numeroFim"
            label="Numero Fim"
            tipo="numero"
            placeholder="000020"
            obrigatorio
          />
        </div>
        <FormField
          name="localizacao"
          label="Localizacao"
          placeholder="Ex: Consultorio 1, Gaveta B"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            name="profissionalId"
            label="Medico"
            tipo="entidade"
            entidade="profissionais"
            placeholder="Selecione..."
          />
          <FormField name="dataRecebimento" label="Data Recebimento" tipo="data" />
        </div>
      </FormLayout>
    </Modal>
  );
}
