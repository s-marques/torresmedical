import {
  CONTRATO_DIA_VENCIMENTO_PADRAO,
  CONTRATO_INDICE_REAJUSTE_ROTULOS,
  CONTRATO_INDICES_REAJUSTE,
  CONTRATO_MODALIDADE_CAMPOS,
  CONTRATO_TIPO_RECEITA_ROTULOS,
  CONTRATO_TIPOS_RECEITA,
  createContratoSalaSchema,
  valorTotalMensal,
  type ContratoSala,
  type ContratoSalaFormulario,
} from '@torres/shared';
import { useWatch } from 'react-hook-form';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { SeletorDias, SeletorLocatario, SeletorModalidade } from './CamposContrato';
import { useSalas } from './use-salas';
import { useAlterarContrato, useCriarContrato } from './use-contratos-sala';

const ID_FORMULARIO = 'form-contrato-sala';

const OPCOES_TIPO_RECEITA = CONTRATO_TIPOS_RECEITA.map((valor) => ({
  valor,
  rotulo: CONTRATO_TIPO_RECEITA_ROTULOS[valor],
}));
const OPCOES_INDICE = CONTRATO_INDICES_REAJUSTE.map((valor) => ({
  valor,
  rotulo: CONTRATO_INDICE_REAJUSTE_ROTULOS[valor],
}));

function valoresIniciais(contrato?: ContratoSala): ContratoSalaFormulario {
  return {
    modalidade: contrato?.modalidade ?? 'MENSAL',
    salaId: contrato?.salaId ?? '',
    locatarioTipo: contrato?.locatarioTipo ?? 'PROFISSIONAL',
    locatarioId: contrato?.locatarioId ?? '',
    especialidade: contrato?.especialidade ?? '',
    valorUnitario: contrato?.valorUnitario as number,
    quantidadeMensal: contrato?.quantidadeMensal ?? null,
    permuta: contrato?.permuta ?? false,
    tipoReceita: contrato?.tipoReceita ?? 'FIXO',
    diaVencimento: contrato?.diaVencimento ?? CONTRATO_DIA_VENCIMENTO_PADRAO,
    formaPagamentoId: contrato?.formaPagamentoId ?? null,
    indiceReajuste: contrato?.indiceReajuste ?? 'NENHUM',
    dataInicio: contrato?.dataInicio ?? '',
    dataFim: contrato?.dataFim ?? '',
    dias: contrato?.dias ?? [],
    permiteIndicacao: contrato?.permiteIndicacao ?? true,
    participaEventos: contrato?.participaEventos ?? false,
    observacoes: contrato?.observacoes ?? '',
  };
}

export interface ModalContratoProps {
  /** Sem contrato: "Novo Contrato". Com contrato: "Editar Contrato". */
  contrato?: ContratoSala;
  onFechar: () => void;
}

export function ModalContrato({ contrato, onFechar }: Readonly<ModalContratoProps>) {
  const criar = useCriarContrato();
  const alterar = useAlterarContrato(contrato?.id ?? '');
  const salas = useSalas();
  const form = useFormulario(createContratoSalaSchema, {
    defaultValues: valoresIniciais(contrato),
  });
  const modalidade = useWatch({ control: form.control, name: 'modalidade' }) ?? 'MENSAL';
  const valor = useWatch({ control: form.control, name: 'valorUnitario' });
  const quantidade = useWatch({ control: form.control, name: 'quantidadeMensal' });
  const campos = CONTRATO_MODALIDADE_CAMPOS[modalidade];
  const opcoesSala = (salas.data?.data ?? []).map((sala) => ({
    valor: sala.id,
    rotulo: sala.numero ? `${sala.nome} (Nº ${sala.numero})` : sala.nome,
  }));
  const mostrarTotal = campos.quantidade !== null && Number.isFinite(valor) && Boolean(quantidade);

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={contrato ? 'Editar Contrato' : 'Novo Contrato'}
      tamanho="lg"
      rodape={
        <FormAcoes form={form} formId={ID_FORMULARIO} rotuloEnviar="Salvar" onCancelar={onFechar} />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        colunas={2}
        onSubmit={async (valores) => {
          await (contrato ? alterar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <div className="sm:col-span-2">
          <SeletorModalidade />
        </div>
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase sm:col-span-2">
          Sala e locatário
        </h3>
        <FormField
          name="salaId"
          label="Sala"
          tipo="select"
          opcoes={opcoesSala}
          placeholder="Selecione a sala..."
          obrigatorio
          className="sm:col-span-2"
        />
        <div className="sm:col-span-2">
          <SeletorLocatario />
        </div>
        <FormField
          name="especialidade"
          label="Especialidade"
          placeholder="Ex: Dermatologia, Cardiologia..."
          className="sm:col-span-2"
        />
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase sm:col-span-2">
          Valores e condições
        </h3>
        <FormField name="valorUnitario" label={campos.valor} tipo="moeda" obrigatorio />
        {campos.quantidade === null ? (
          <FormField
            name="tipoReceita"
            label="Tipo de Receita"
            tipo="select"
            opcoes={OPCOES_TIPO_RECEITA}
          />
        ) : (
          <FormField
            name="quantidadeMensal"
            label={campos.quantidade}
            tipo="numero"
            placeholder={modalidade === 'TURNO' ? 'Ex: 8' : 'Ex: 20'}
            obrigatorio
          />
        )}
        {mostrarTotal && (
          <p className="text-sm text-blue-600 sm:col-span-2">
            Total mensal estimado:{' '}
            {formatarMoeda(valorTotalMensal(modalidade, valor, quantidade ?? 0))} ({quantidade}{' '}
            {campos.unidadeQuantidade} × {formatarMoeda(valor)})
          </p>
        )}
        <div className="sm:col-span-2">
          <FormField
            name="permuta"
            label="Permuta / sem cobrança (o contrato não vai gerar nenhuma parcela)"
            tipo="checkbox"
          />
        </div>
        <FormField name="diaVencimento" label="Dia Vencimento" tipo="numero" />
        <FormField
          name="formaPagamentoId"
          label="Forma Pagamento"
          tipo="entidade"
          entidade="formas-pagamento"
          filtros={{ finalidade: 'receber' }}
          placeholder="Não informado"
        />
        <FormField
          name="indiceReajuste"
          label="Índice Reajuste"
          tipo="select"
          opcoes={OPCOES_INDICE}
          className="sm:col-span-2"
        />
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase sm:col-span-2">
          Vigência
        </h3>
        <FormField name="dataInicio" label="Data Início" tipo="data" obrigatorio />
        <FormField name="dataFim" label="Data Fim (opcional)" tipo="data" />
        <div className="sm:col-span-2">
          <SeletorDias />
        </div>
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase sm:col-span-2">
          Configurações
        </h3>
        <FormField name="permiteIndicacao" label="Permite indicação de pacientes" tipo="checkbox" />
        <FormField name="participaEventos" label="Participa de eventos" tipo="checkbox" />
        <FormField
          name="observacoes"
          label="Observações"
          tipo="textarea"
          className="sm:col-span-2"
        />
      </FormLayout>
    </Modal>
  );
}
