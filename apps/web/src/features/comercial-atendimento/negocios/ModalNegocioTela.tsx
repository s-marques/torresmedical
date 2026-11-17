import {
  NEGOCIO_CONTATO_ROTULO,
  NEGOCIO_CONTATO_TIPOS,
  NEGOCIO_STATUS,
  NEGOCIO_STATUS_ROTULO,
  negocioTelaInputSchema,
  type Negocio,
  type NegocioTelaFormulario,
  type Pipeline,
} from '@torres/shared';
import { useEffect, useRef } from 'react';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import {
  useCriarNegocioTela,
  useEditarNegocioTela,
  useMotivosPerdaNegocios,
  useResponsaveisNegocios,
} from './use-negocios';

const ID_FORMULARIO = 'form-negocio-tela';

const OPCOES_CONTATO = NEGOCIO_CONTATO_TIPOS.map((tipo) => ({
  valor: tipo,
  rotulo: NEGOCIO_CONTATO_ROTULO[tipo],
}));
const OPCOES_STATUS = NEGOCIO_STATUS.map((status) => ({
  valor: status,
  rotulo: NEGOCIO_STATUS_ROTULO[status],
}));

function valoresIniciais(negocio?: Negocio): NegocioTelaFormulario {
  return {
    titulo: negocio?.titulo ?? '',
    valor: negocio?.valor === null || negocio?.valor === undefined ? null : Number(negocio.valor),
    pipelineId: negocio?.pipelineId ?? '',
    estagioId: negocio?.estagioId ?? '',
    contatoTipo: negocio?.contatoTipo ?? 'PACIENTE',
    contatoId: negocio?.contatoId ?? null,
    responsavelId: negocio?.responsavelId ?? '',
    previsaoFechamento: negocio?.previsaoFechamento ?? '',
    origemClienteId: negocio?.origemClienteId ?? null,
    status: negocio?.status ?? 'ABERTO',
    motivoPerdaId: negocio?.motivoPerdaId ?? '',
    observacoes: negocio?.observacoes ?? '',
  };
}

export interface ModalNegocioTelaProps {
  pipelines: readonly Pipeline[];
  /** Sem negócio: "Novo Negócio". Com negócio: "Editar Negócio". */
  negocio?: Negocio;
  onFechar: () => void;
}

/** Modal "Novo Negócio" e "Editar Negócio" da tela Negócios (`/negocios`). */
export function ModalNegocioTela({
  pipelines,
  negocio,
  onFechar,
}: Readonly<ModalNegocioTelaProps>) {
  const criar = useCriarNegocioTela();
  const editar = useEditarNegocioTela(negocio?.id ?? '');
  const responsaveis = useResponsaveisNegocios();
  const motivos = useMotivosPerdaNegocios();
  const form = useFormulario(negocioTelaInputSchema, { defaultValues: valoresIniciais(negocio) });

  // Trocar Paciente ↔ Profissional limpa o contato escolhido.
  const contatoTipo = form.watch('contatoTipo');
  const tipoAnterior = useRef(contatoTipo);
  useEffect(() => {
    if (tipoAnterior.current !== contatoTipo) form.setValue('contatoId', null);
    tipoAnterior.current = contatoTipo;
  }, [contatoTipo, form]);

  // Trocar o pipeline limpa o estágio, que é de um pipeline só.
  const pipelineId = form.watch('pipelineId');
  const pipelineAnterior = useRef(pipelineId);
  useEffect(() => {
    if (pipelineAnterior.current !== pipelineId) form.setValue('estagioId', '');
    pipelineAnterior.current = pipelineId;
  }, [pipelineId, form]);

  const estagios = pipelines.find((p) => p.id === pipelineId)?.estagios ?? [];
  const perdido = form.watch('status') === 'PERDIDO';

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={negocio ? 'Editar Negócio' : 'Novo Negócio'}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={negocio ? 'Salvar' : 'Criar Negócio'}
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
        <FormField name="titulo" label="Título" placeholder="Título do negócio" obrigatorio />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField name="valor" label="Valor (R$)" tipo="moeda" />
          <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
            <FormField name="contatoTipo" label="Contato" tipo="select" opcoes={OPCOES_CONTATO} />
            <FormField
              name="contatoId"
              label="Cliente"
              tipo="entidade"
              entidade={contatoTipo === 'PROFISSIONAL' ? 'profissionais' : 'pacientes'}
              placeholder="Buscar cliente..."
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            name="pipelineId"
            label="Pipeline"
            tipo="select"
            placeholder="Selecione o pipeline"
            opcoes={pipelines.map((p) => ({ valor: p.id, rotulo: p.nome }))}
          />
          <FormField
            name="estagioId"
            label="Estágio"
            tipo="select"
            placeholder="Selecione o estágio"
            opcoes={estagios.map((e) => ({ valor: e.id, rotulo: e.nome }))}
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
          <FormField name="previsaoFechamento" label="Previsão de Fechamento" tipo="data" />
          <FormField name="status" label="Status" tipo="select" opcoes={OPCOES_STATUS} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            name="origemClienteId"
            label="Origem"
            tipo="entidade"
            entidade="origens-cliente"
            placeholder="Não informado"
          />
          {perdido && (
            <FormField
              name="motivoPerdaId"
              label="Motivo da perda"
              tipo="select"
              obrigatorio
              opcoes={(motivos.data ?? []).map((m) => ({ valor: m.id, rotulo: m.nome }))}
            />
          )}
        </div>
        <FormField
          name="observacoes"
          label="Observações"
          tipo="textarea"
          placeholder="Observações sobre o negócio..."
        />
      </FormLayout>
    </Modal>
  );
}
