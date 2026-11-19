import {
  createSalaBloqueioSchema,
  SALA_BLOQUEIO_HORARIO_PADRAO,
  SALA_BLOQUEIO_TIPOS,
  type CreateSalaBloqueioInput,
  type SalaBloqueio,
  type SalaBloqueioFormulario,
} from '@torres/shared';
import { useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { hojeISO } from '@/lib/datas';
import { SeletorDias, type TextosSeletorDias } from './CamposContrato';
import { useAlterarBloqueio, useCriarBloqueio } from './use-bloqueios-sala';
import { useSalas } from './use-salas';

const ID_FORMULARIO = 'form-bloqueio-sala';
const METADE = 'sm:col-span-1';
const LINHA = 'sm:col-span-2';

export interface ModalBloqueioSalaProps {
  /** Sem bloqueio: "Novo Bloqueio". Com bloqueio: "Editar Bloqueio". */
  bloqueio?: SalaBloqueio;
  onFechar: () => void;
}

function valoresIniciais(b?: SalaBloqueio): SalaBloqueioFormulario {
  const hoje = hojeISO();
  return {
    salaId: b?.salaId ?? '',
    tipo: b?.tipo ?? '',
    profissionalId: b?.profissionalId ?? null,
    recorrente: b?.recorrente ?? false,
    dataInicio: b?.dataInicio ?? hoje,
    dataFim: b?.dataFim ?? hoje,
    horaInicio: b?.horaInicio ?? SALA_BLOQUEIO_HORARIO_PADRAO.inicio,
    horaFim: b?.horaFim ?? SALA_BLOQUEIO_HORARIO_PADRAO.fim,
    dias: b?.dias ?? [],
    motivo: b?.motivo ?? '',
  };
}

/**
 * Modal "Novo Bloqueio" / "Editar Bloqueio" da aba Bloqueios (issue #138): sala, tipo,
 * profissional opcional, período único (data e hora de início e fim) ou recorrente (dias da
 * semana entre as datas) e motivo. O responsável é o usuário logado (gravado pela API).
 */
export function ModalBloqueioSala({ bloqueio, onFechar }: Readonly<ModalBloqueioSalaProps>) {
  const { t } = useTranslation();
  const criar = useCriarBloqueio();
  const alterar = useAlterarBloqueio(bloqueio?.id ?? '');
  const salas = useSalas();
  const form = useFormulario(createSalaBloqueioSchema, {
    defaultValues: valoresIniciais(bloqueio),
  });
  const recorrente = useWatch({ control: form.control, name: 'recorrente' });
  const campo = (nome: string) => t(`salasBloqueios.campos.${nome}`);

  const opcoesSala = (salas.data?.data ?? []).map((sala) => ({
    valor: sala.id,
    rotulo: sala.nome,
  }));
  const opcoesTipo = SALA_BLOQUEIO_TIPOS.map((valor) => ({
    valor,
    rotulo: t(`salasBloqueios.tipos.${valor}`),
  }));
  const textosDias: TextosSeletorDias = {
    legenda: campo('dias'),
    as: campo('as'),
    nomeDia: (dia) => t(`salasBloqueios.diasSemana.${dia}`),
    abreviacao: (dia) => t(`salasBloqueios.diasAbrev.${dia}`),
    horaInicial: (dia) => t('salasBloqueios.campos.horaInicialDe', { dia }),
    horaFinal: (dia) => t('salasBloqueios.campos.horaFinalDe', { dia }),
  };

  async function salvar(valores: CreateSalaBloqueioInput) {
    if (bloqueio) await alterar.mutateAsync(valores);
    else await criar.mutateAsync(valores);
    onFechar();
  }

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={bloqueio ? t('salasBloqueios.editar') : t('salasBloqueios.novo')}
      tamanho="lg"
      rodape={<FormAcoes form={form} formId={ID_FORMULARIO} onCancelar={onFechar} />}
    >
      <FormLayout id={ID_FORMULARIO} form={form} acoes={null} colunas={2} onSubmit={salvar}>
        <FormField
          name="salaId"
          label={campo('salaId')}
          tipo="select"
          opcoes={opcoesSala}
          placeholder={t('salasBloqueios.placeholders.sala')}
          obrigatorio
          className={METADE}
        />
        <FormField
          name="tipo"
          label={campo('tipo')}
          tipo="select"
          opcoes={opcoesTipo}
          placeholder={t('salasBloqueios.placeholders.tipo')}
          obrigatorio
          className={METADE}
        />
        <FormField
          name="profissionalId"
          label={campo('profissionalId')}
          tipo="entidade"
          entidade="profissionais"
          placeholder={t('salasBloqueios.placeholders.profissional')}
          className={LINHA}
        />
        <FormField
          name="recorrente"
          label={campo('recorrente')}
          tipo="switch"
          descricao={
            recorrente ? t('salasBloqueios.ajudaRecorrente') : t('salasBloqueios.ajudaPeriodo')
          }
          className={LINHA}
        />
        <FormField
          name="dataInicio"
          label={campo('dataInicio')}
          tipo="data"
          obrigatorio
          className={METADE}
        />
        <FormField
          name="dataFim"
          label={campo('dataFim')}
          tipo="data"
          obrigatorio
          className={METADE}
        />
        {recorrente ? (
          <div className={LINHA}>
            <SeletorDias textos={textosDias} />
          </div>
        ) : (
          <>
            <FormField
              name="horaInicio"
              label={campo('horaInicio')}
              tipo="hora"
              obrigatorio
              className={METADE}
            />
            <FormField
              name="horaFim"
              label={campo('horaFim')}
              tipo="hora"
              obrigatorio
              className={METADE}
            />
          </>
        )}
        <FormField
          name="motivo"
          label={campo('motivo')}
          tipo="textarea"
          placeholder={t('salasBloqueios.placeholders.motivo')}
          className={LINHA}
        />
      </FormLayout>
    </Modal>
  );
}
