import {
  BANDEIRA_ICONE_PADRAO,
  createBandeiraSchema,
  type BandeiraFormulario,
} from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useCriarBandeira } from './use-bandeiras';

const ID_FORMULARIO = 'form-bandeira';

const VALORES_INICIAIS: BandeiraFormulario = { nome: '', icone: BANDEIRA_ICONE_PADRAO };

/** Modal "Nova Bandeira": Nome e Ícone (FontAwesome). */
export function ModalBandeira({ onFechar }: Readonly<{ onFechar: () => void }>) {
  const criar = useCriarBandeira();
  const form = useFormulario(createBandeiraSchema, { defaultValues: VALORES_INICIAIS });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Nova Bandeira"
      rodape={
        <FormAcoes form={form} formId={ID_FORMULARIO} rotuloEnviar="Criar" onCancelar={onFechar} />
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
        <FormField
          name="nome"
          label="Nome"
          obrigatorio
          placeholder="Ex: Visa, Mastercard, Elo..."
        />
        <FormField
          name="icone"
          label="Icone (FontAwesome)"
          descricao="Ex: fa-cc-visa, fa-cc-mastercard, fa-credit-card"
        />
      </FormLayout>
    </Modal>
  );
}
