import {
  NEGOCIO_CONTATO_ROTULO,
  NEGOCIO_CONTATO_TIPOS,
  negocioInputSchema,
  type Estagio,
  type Negocio,
  type NegocioFormulario,
} from '@torres/shared';
import { useEffect, useRef } from 'react';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useCriarNegocio, useEditarNegocio, useResponsaveis } from './use-pipeline';

const ID_FORMULARIO = 'form-negocio';

const OPCOES_CONTATO = NEGOCIO_CONTATO_TIPOS.map((tipo) => ({
  valor: tipo,
  rotulo: NEGOCIO_CONTATO_ROTULO[tipo],
}));

function valoresIniciais(estagioId: string, negocio?: Negocio): NegocioFormulario {
  return {
    titulo: negocio?.titulo ?? '',
    valor: negocio?.valor === null || negocio?.valor === undefined ? null : Number(negocio.valor),
    estagioId: negocio?.estagioId ?? estagioId,
    contatoTipo: negocio?.contatoTipo ?? 'PACIENTE',
    contatoId: negocio?.contatoId ?? null,
    responsavelId: negocio?.responsavelId ?? '',
    previsaoFechamento: negocio?.previsaoFechamento ?? '',
    origemClienteId: negocio?.origemClienteId ?? null,
  };
}

export interface ModalNegocioProps {
  /** Estágios do pipeline atual (combobox "Estágio"). */
  estagios: readonly Estagio[];
  /** Estágio já escolhido: o primeiro do pipeline ou a coluna do botão "+". */
  estagioInicial: string;
  /** Sem negócio: "Novo Negócio". Com negócio: "Editar Negócio". */
  negocio?: Negocio;
  onFechar: () => void;
}

/** Modal "Novo Negócio" e "Editar Negócio" (`/crm`). */
export function ModalNegocio({
  estagios,
  estagioInicial,
  negocio,
  onFechar,
}: Readonly<ModalNegocioProps>) {
  const criar = useCriarNegocio();
  const editar = useEditarNegocio(negocio?.id ?? '');
  const responsaveis = useResponsaveis();
  const form = useFormulario(negocioInputSchema, {
    defaultValues: valoresIniciais(estagioInicial, negocio),
  });

  // Trocar Paciente ↔ Profissional limpa o contato escolhido.
  const contatoTipo = form.watch('contatoTipo');
  const tipoAnterior = useRef(contatoTipo);
  useEffect(() => {
    if (tipoAnterior.current !== contatoTipo) form.setValue('contatoId', null);
    tipoAnterior.current = contatoTipo;
  }, [contatoTipo, form]);

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={negocio ? 'Editar Negócio' : 'Novo Negócio'}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={negocio ? 'Salvar' : 'Criar'}
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await (negocio ? editar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField
          name="titulo"
          label="Título"
          placeholder="Ex: Sala 10 - Clínica geral"
          obrigatorio
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="valor" label="Valor (R$)" tipo="moeda" />
          <FormField
            name="estagioId"
            label="Estágio"
            tipo="select"
            opcoes={estagios.map((e) => ({ valor: e.id, rotulo: e.nome }))}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <FormField name="contatoTipo" label="Contato" tipo="select" opcoes={OPCOES_CONTATO} />
          <FormField
            name="contatoId"
            label={NEGOCIO_CONTATO_ROTULO[contatoTipo ?? 'PACIENTE']}
            tipo="entidade"
            entidade={contatoTipo === 'PROFISSIONAL' ? 'profissionais' : 'pacientes'}
            placeholder={
              contatoTipo === 'PROFISSIONAL' ? 'Buscar profissional...' : 'Buscar paciente...'
            }
          />
        </div>
        <FormField
          name="responsavelId"
          label="Responsável"
          tipo="select"
          placeholder="Nenhum"
          opcoes={(responsaveis.data ?? []).map((r) => ({ valor: r.id, rotulo: r.nome }))}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="previsaoFechamento" label="Previsão fechamento" tipo="data" />
          <FormField
            name="origemClienteId"
            label="Origem"
            tipo="entidade"
            entidade="origens-cliente"
            placeholder="Não informado"
          />
        </div>
      </FormLayout>
    </Modal>
  );
}
