import {
  createSalaSchema,
  SALA_TIPO_ROTULOS,
  SALA_TIPOS,
  type Sala,
  type SalaFormulario,
} from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useAlterarSala, useCriarSala } from './use-salas';

const ID_FORMULARIO = 'form-sala';

const OPCOES_TIPO = SALA_TIPOS.map((tipo) => ({ valor: tipo, rotulo: SALA_TIPO_ROTULOS[tipo] }));

function valoresIniciais(sala?: Sala): SalaFormulario {
  return {
    nome: sala?.nome ?? '',
    numero: sala?.numero ?? '',
    andar: sala?.andar ?? '',
    tipo: sala?.tipo ?? 'CONSULTORIO',
    metragem: sala?.metragem ?? null,
    valorHora: sala?.valorHora ?? null,
    valorTurno: sala?.valorTurno ?? null,
    valorMensal: sala?.valorMensal ?? null,
    equipamentos: sala?.equipamentos ?? '',
  };
}

export interface ModalSalaProps {
  /** Sem sala: "Nova Sala". Com sala: "Editar Sala". */
  sala?: Sala;
  onFechar: () => void;
}

export function ModalSala({ sala, onFechar }: Readonly<ModalSalaProps>) {
  const criar = useCriarSala();
  const alterar = useAlterarSala(sala?.id ?? '');
  const form = useFormulario(createSalaSchema, { defaultValues: valoresIniciais(sala) });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={sala ? 'Editar Sala' : 'Nova Sala'}
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
          await (sala ? alterar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField name="nome" label="Nome" obrigatorio className="sm:col-span-2" />
        <FormField name="numero" label="Número" />
        <FormField name="andar" label="Andar" />
        <FormField name="tipo" label="Tipo" tipo="select" opcoes={OPCOES_TIPO} />
        <FormField name="metragem" label="m²" tipo="numero" />
        <FormField name="valorHora" label="R$/Hora" tipo="moeda" />
        <FormField name="valorTurno" label="R$/Turno" tipo="moeda" />
        <FormField name="valorMensal" label="R$/Mês" tipo="moeda" />
        <FormField
          name="equipamentos"
          label="Equipamentos"
          tipo="textarea"
          className="sm:col-span-2 lg:col-span-3"
        />
      </FormLayout>
    </Modal>
  );
}
