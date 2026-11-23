import {
  COLETA_RESIDUO_TIPOS,
  createColetaResiduoSchema,
  type ColetaResiduo,
  type ColetaResiduoFormInput,
} from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useEditarColetaResiduo, useRegistrarColetaResiduo } from './use-coletas-residuo';

const ID_FORMULARIO = 'form-coleta-residuo';

export interface ModalColetaResiduoProps {
  /** Sem coleta: "Nova Coleta de Resíduo". Com coleta: "Editar Coleta de Resíduo". */
  coleta?: ColetaResiduo;
  onFechar: () => void;
}

function valoresIniciais(c?: ColetaResiduo): Partial<ColetaResiduoFormInput> {
  return {
    dataColeta: c?.dataColeta ?? '',
    proximaColeta: c?.proximaColeta ?? '',
    empresaColetora: c?.empresaColetora ?? '',
    manifestoMtr: c?.manifestoMtr ?? '',
    pesoKg: c?.pesoKg ?? null,
    tipoResiduo: c?.tipoResiduo,
    responsavel: c?.responsavel ?? '',
    observacoes: c?.observacoes ?? '',
  };
}

/**
 * Modal "Nova Coleta de Resíduo" e "Editar Coleta de Resíduo" (print do inventário e do dev na
 * #65). Obrigatórios: Data Coleta e Tipo Resíduo. Grade de 6 colunas: Peso, Tipo e Responsável
 * dividem a linha em terços, como no print.
 */
export function ModalColetaResiduo({ coleta, onFechar }: Readonly<ModalColetaResiduoProps>) {
  const { t } = useTranslation();
  const registrar = useRegistrarColetaResiduo();
  const editar = useEditarColetaResiduo(coleta?.id ?? '');
  const form = useFormulario(createColetaResiduoSchema, {
    defaultValues: valoresIniciais(coleta),
  });
  const opcoesTipo = COLETA_RESIDUO_TIPOS.map((valor) => ({
    valor,
    rotulo: t(`coletasResiduo.tipos.${valor}`),
  }));
  const c = (chave: string) => t(`coletasResiduo.campos.${chave}`);

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={coleta ? t('coletasResiduo.editarTitulo') : t('coletasResiduo.novoTitulo')}
      tamanho="lg"
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={coleta ? t('comum.salvar') : t('coletasResiduo.registrar')}
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await (coleta ? editar : registrar).mutateAsync(valores);
          onFechar();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-6">
          <FormField
            name="dataColeta"
            label={c('dataColeta')}
            tipo="data"
            obrigatorio
            className="sm:col-span-3"
          />
          <FormField
            name="proximaColeta"
            label={c('proximaColeta')}
            tipo="data"
            className="sm:col-span-3"
          />
          <FormField
            name="empresaColetora"
            label={c('empresaColetora')}
            className="sm:col-span-3"
          />
          <FormField name="manifestoMtr" label={c('manifestoMtr')} className="sm:col-span-3" />
          <FormField name="pesoKg" label={c('pesoKg')} tipo="numero" className="sm:col-span-2" />
          <FormField
            name="tipoResiduo"
            label={c('tipoResiduo')}
            tipo="select"
            opcoes={opcoesTipo}
            obrigatorio
            className="sm:col-span-2"
          />
          <FormField name="responsavel" label={c('responsavel')} className="sm:col-span-2" />
          <FormField
            name="observacoes"
            label={c('observacoes')}
            tipo="textarea"
            className="sm:col-span-6"
          />
        </div>
      </FormLayout>
    </Modal>
  );
}
