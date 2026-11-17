import {
  ATIVIDADE_TIPO_ROTULO,
  ATIVIDADE_TIPOS,
  atividadeInputSchema,
  type Atividade,
  type AtividadeFormulario,
} from '@torres/shared';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { partesDataHora } from './partes-data-hora';
import {
  useCriarAtividade,
  useEditarAtividade,
  useFecharAtividade,
  useResponsaveisAtividades,
} from './use-atividades';

const ID_FORMULARIO = 'form-atividade';

const OPCOES_TIPO = ATIVIDADE_TIPOS.map((tipo) => ({
  valor: tipo,
  rotulo: ATIVIDADE_TIPO_ROTULO[tipo],
}));

function valoresIniciais(atividade?: Atividade, negocioId?: string | null): AtividadeFormulario {
  const quando = atividade ? partesDataHora(atividade.dataHora) : { data: '', hora: '' };
  return {
    titulo: atividade?.titulo ?? '',
    tipo: atividade?.tipo ?? 'TAREFA',
    negocioId: atividade?.negocioId ?? negocioId ?? null,
    data: quando.data,
    hora: quando.hora,
    responsavelId: atividade?.responsavelId ?? '',
    descricao: atividade?.descricao ?? '',
  };
}

/** Fechar (concluir/cancelar) a última atividade pendente de um negócio aberto. */
export interface FechamentoAtividade {
  atividade: Atividade;
  acao: 'concluir' | 'cancelar';
}

export interface ModalAtividadeProps {
  /** Sem atividade: "Nova Atividade". Com atividade: "Editar Atividade". */
  atividade?: Atividade;
  /** Agenda a próxima atividade do negócio e então conclui/cancela a atual. */
  fechamento?: FechamentoAtividade;
  onFechar: () => void;
}

function textos(atividade?: Atividade, fechamento?: FechamentoAtividade) {
  if (fechamento) {
    const verbo = fechamento.acao === 'concluir' ? 'concluir' : 'cancelar';
    return {
      titulo: 'Agendar próxima atividade',
      descricao: `"${fechamento.atividade.titulo}" é a última atividade pendente do negócio "${fechamento.atividade.negocio ?? ''}". Para ${verbo}, agende a próxima ou marque o negócio como ganho ou perdido.`,
      enviar: fechamento.acao === 'concluir' ? 'Agendar e concluir' : 'Agendar e cancelar',
    };
  }
  return atividade
    ? { titulo: 'Editar Atividade', descricao: undefined, enviar: 'Salvar' }
    : { titulo: 'Nova Atividade', descricao: undefined, enviar: 'Criar Atividade' };
}

/**
 * Modal "Nova Atividade" (Título*, Tipo, Negócio, Data Agendamento, Descrição), "Editar
 * Atividade" e o agendamento da próxima ao fechar a última pendente de um negócio aberto.
 */
export function ModalAtividade({ atividade, fechamento, onFechar }: Readonly<ModalAtividadeProps>) {
  const criar = useCriarAtividade();
  const editar = useEditarAtividade(atividade?.id ?? '');
  const fechar = useFecharAtividade(fechamento?.acao ?? 'concluir');
  const responsaveis = useResponsaveisAtividades();
  const form = useFormulario(atividadeInputSchema, {
    defaultValues: valoresIniciais(atividade, fechamento?.atividade.negocioId),
  });
  const texto = textos(atividade, fechamento);

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={texto.titulo}
      descricao={texto.descricao}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={texto.enviar}
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          if (fechamento) {
            await fechar.mutateAsync({ id: fechamento.atividade.id, proxima: valores });
          } else {
            await (atividade ? editar : criar).mutateAsync(valores);
          }
          onFechar();
        }}
      >
        <FormField name="titulo" label="Título" placeholder="Título da atividade" obrigatorio />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="tipo" label="Tipo" tipo="select" opcoes={OPCOES_TIPO} />
          <FormField
            name="negocioId"
            label="Negócio"
            tipo="entidade"
            entidade="negocios"
            placeholder="Opcional"
            disabled={fechamento !== undefined}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="data" label="Data Agendamento" tipo="data" obrigatorio />
          <FormField name="hora" label="Hora" tipo="hora" obrigatorio />
        </div>
        <FormField
          name="responsavelId"
          label="Responsável"
          tipo="select"
          placeholder="Responsável do negócio"
          opcoes={(responsaveis.data ?? []).map((r) => ({ valor: r.id, rotulo: r.nome }))}
        />
        <FormField
          name="descricao"
          label="Descrição"
          tipo="textarea"
          placeholder="Descrição da atividade"
        />
      </FormLayout>
    </Modal>
  );
}
