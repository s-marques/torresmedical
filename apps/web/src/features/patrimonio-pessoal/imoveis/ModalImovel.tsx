import {
  createImovelSchema,
  IMOVEL_TIPOS,
  type Imovel,
  type ImovelFormInput,
} from '@torres/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useCriarImovel, useEditarImovel } from './use-imoveis';

const ID_FORMULARIO = 'form-imovel';

/** Grade de 6 colunas: campos de metade (3), de um terço (2) ou de linha inteira (6), como no print. */
const METADE = 'sm:col-span-3';
const TERCO = 'sm:col-span-2';
const LINHA = 'sm:col-span-6';

export interface ModalImovelProps {
  /** Sem imóvel: "Novo Imóvel". Com imóvel: "Editar Imóvel". */
  imovel?: Imovel;
  onFechar: () => void;
}

function valoresIniciais(i?: Imovel): ImovelFormInput {
  return {
    descricao: i?.descricao ?? '',
    tipo: i?.tipo ?? 'APARTAMENTO',
    endereco: i?.endereco ?? '',
    matricula: i?.matricula ?? '',
    valorCompra: i?.valorCompra ?? null,
    dataCompra: i?.dataCompra ?? '',
    iptuAnual: i?.iptuAnual ?? null,
    itbiPago: i?.itbiPago ?? null,
    banco: i?.banco ?? '',
    financiamentoParcela: i?.financiamentoParcela ?? null,
    saldoDevedor: i?.saldoDevedor ?? null,
    vencimentoFinanciamento: i?.vencimentoFinanciamento ?? '',
    condominio: i?.condominio ?? null,
    contaLuz: i?.contaLuz ?? null,
    contaAgua: i?.contaAgua ?? null,
    internet: i?.internet ?? null,
    seguro: i?.seguro ?? null,
    observacoes: i?.observacoes ?? '',
  };
}

function Secao({ titulo, children }: Readonly<{ titulo: string; children: ReactNode }>) {
  return (
    <fieldset className="grid gap-4 sm:grid-cols-6">
      <legend className="text-muted-foreground mb-4 text-sm font-medium">{titulo}</legend>
      {children}
    </fieldset>
  );
}

/**
 * Modal "Novo Imóvel" e "Editar Imóvel" (print do inventário e prints do dev na #61), com as
 * seções Dados do Imóvel, Financiamento e Despesas Mensais Vinculadas. Só a Descrição é obrigatória.
 */
export function ModalImovel({ imovel, onFechar }: Readonly<ModalImovelProps>) {
  const { t } = useTranslation();
  const criar = useCriarImovel();
  const editar = useEditarImovel(imovel?.id ?? '');
  const form = useFormulario(createImovelSchema, { defaultValues: valoresIniciais(imovel) });
  const opcoesTipo = IMOVEL_TIPOS.map((valor) => ({ valor, rotulo: t(`imoveis.tipos.${valor}`) }));
  const campo = (nome: keyof ImovelFormInput) => t(`imoveis.campos.${nome}`);

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={imovel ? t('imoveis.editar') : t('imoveis.novo')}
      tamanho="lg"
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={imovel ? t('comum.salvar') : t('imoveis.cadastrar')}
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await (imovel ? editar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <div className="grid gap-6">
          <Secao titulo={t('imoveis.secoes.dados')}>
            <FormField
              name="descricao"
              label={campo('descricao')}
              obrigatorio
              placeholder={t('imoveis.placeholders.descricao')}
              className={METADE}
            />
            <FormField
              name="tipo"
              label={campo('tipo')}
              tipo="select"
              opcoes={opcoesTipo}
              className={METADE}
            />
            <FormField
              name="endereco"
              label={campo('endereco')}
              placeholder={t('imoveis.placeholders.endereco')}
              className={LINHA}
            />
            <FormField name="matricula" label={campo('matricula')} className={TERCO} />
            <FormField
              name="valorCompra"
              label={campo('valorCompra')}
              tipo="moeda"
              className={TERCO}
            />
            <FormField
              name="dataCompra"
              label={campo('dataCompra')}
              tipo="data"
              className={TERCO}
            />
            <FormField
              name="iptuAnual"
              label={campo('iptuAnual')}
              tipo="moeda"
              className={METADE}
            />
            <FormField name="itbiPago" label={campo('itbiPago')} tipo="moeda" className={METADE} />
          </Secao>

          <Secao titulo={t('imoveis.secoes.financiamento')}>
            <FormField
              name="banco"
              label={campo('banco')}
              placeholder={t('imoveis.placeholders.banco')}
              className={METADE}
            />
            <FormField
              name="financiamentoParcela"
              label={campo('financiamentoParcela')}
              tipo="moeda"
              className={METADE}
            />
            <FormField
              name="saldoDevedor"
              label={campo('saldoDevedor')}
              tipo="moeda"
              className={METADE}
            />
            <FormField
              name="vencimentoFinanciamento"
              label={campo('vencimentoFinanciamento')}
              tipo="data"
              className={METADE}
            />
          </Secao>

          <Secao titulo={t('imoveis.secoes.despesas')}>
            <FormField
              name="condominio"
              label={campo('condominio')}
              tipo="moeda"
              className={TERCO}
            />
            <FormField name="contaLuz" label={campo('contaLuz')} tipo="moeda" className={TERCO} />
            <FormField name="contaAgua" label={campo('contaAgua')} tipo="moeda" className={TERCO} />
            <FormField name="internet" label={campo('internet')} tipo="moeda" className={METADE} />
            <FormField name="seguro" label={campo('seguro')} tipo="moeda" className={METADE} />
          </Secao>

          <FormField
            name="observacoes"
            label={campo('observacoes')}
            tipo="textarea"
            placeholder={t('imoveis.placeholders.observacoes')}
          />
        </div>
      </FormLayout>
    </Modal>
  );
}
