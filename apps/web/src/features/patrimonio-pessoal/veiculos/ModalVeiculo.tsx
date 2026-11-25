import {
  createVeiculoSchema,
  VEICULO_TIPOS,
  VEICULO_USOS,
  type Veiculo,
  type VeiculoFormInput,
} from '@torres/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useCriarVeiculo, useEditarVeiculo } from './use-veiculos';

const ID_FORMULARIO = 'form-veiculo';

/** Grade de 6 colunas: campos de metade (3), de um terço (2) ou de linha inteira (6), como no print. */
const METADE = 'sm:col-span-3';
const TERCO = 'sm:col-span-2';

export interface ModalVeiculoProps {
  /** Sem veículo: "Novo Veiculo". Com veículo: "Editar Veiculo". */
  veiculo?: Veiculo;
  onFechar: () => void;
}

function valoresIniciais(v?: Veiculo): VeiculoFormInput {
  return {
    descricao: v?.descricao ?? '',
    tipo: v?.tipo ?? 'CARRO',
    placa: v?.placa ?? '',
    renavam: v?.renavam ?? '',
    chassi: v?.chassi ?? '',
    ano: v?.ano ?? null,
    cor: v?.cor ?? '',
    uso: v?.uso ?? 'CLINICA',
    valorCompra: v?.valorCompra ?? null,
    dataCompra: v?.dataCompra ?? '',
    ipvaAnual: v?.ipvaAnual ?? null,
    licenciamento: v?.licenciamento ?? null,
    seguroAnual: v?.seguroAnual ?? null,
    vencimentoSeguro: v?.vencimentoSeguro ?? '',
    banco: v?.banco ?? '',
    financiamentoParcela: v?.financiamentoParcela ?? null,
    saldoDevedor: v?.saldoDevedor ?? null,
    vencimentoFinanciamento: v?.vencimentoFinanciamento ?? '',
    observacoes: v?.observacoes ?? '',
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
 * Modal "Novo Veiculo" e "Editar Veiculo" (print do inventário e prints do dev na #63), com as
 * seções Dados do Veículo, Valores e Impostos e Financiamento/Leasing. Só a Descrição é
 * obrigatória.
 */
export function ModalVeiculo({ veiculo, onFechar }: Readonly<ModalVeiculoProps>) {
  const { t } = useTranslation();
  const criar = useCriarVeiculo();
  const editar = useEditarVeiculo(veiculo?.id ?? '');
  const form = useFormulario(createVeiculoSchema, { defaultValues: valoresIniciais(veiculo) });
  const opcoesTipo = VEICULO_TIPOS.map((valor) => ({
    valor,
    rotulo: t(`veiculos.tipos.${valor}`),
  }));
  const opcoesUso = VEICULO_USOS.map((valor) => ({ valor, rotulo: t(`veiculos.usos.${valor}`) }));
  const campo = (nome: keyof VeiculoFormInput) => t(`veiculos.campos.${nome}`);

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={veiculo ? t('veiculos.editar') : t('veiculos.novo')}
      tamanho="lg"
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={veiculo ? t('comum.salvar') : t('veiculos.cadastrar')}
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await (veiculo ? editar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <div className="grid gap-6">
          <Secao titulo={t('veiculos.secoes.dados')}>
            <FormField
              name="descricao"
              label={campo('descricao')}
              obrigatorio
              placeholder={t('veiculos.placeholders.descricao')}
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
              name="placa"
              label={campo('placa')}
              placeholder={t('veiculos.placeholders.placa')}
              className={TERCO}
            />
            <FormField name="renavam" label={campo('renavam')} className={TERCO} />
            <FormField name="chassi" label={campo('chassi')} className={TERCO} />
            <FormField
              name="ano"
              label={campo('ano')}
              tipo="numero"
              placeholder={t('veiculos.placeholders.ano')}
              className={TERCO}
            />
            <FormField
              name="cor"
              label={campo('cor')}
              placeholder={t('veiculos.placeholders.cor')}
              className={TERCO}
            />
            <FormField
              name="uso"
              label={campo('uso')}
              tipo="select"
              opcoes={opcoesUso}
              className={TERCO}
            />
          </Secao>

          <Secao titulo={t('veiculos.secoes.valores')}>
            <FormField
              name="valorCompra"
              label={campo('valorCompra')}
              tipo="moeda"
              className={METADE}
            />
            <FormField
              name="dataCompra"
              label={campo('dataCompra')}
              tipo="data"
              className={METADE}
            />
            <FormField name="ipvaAnual" label={campo('ipvaAnual')} tipo="moeda" className={TERCO} />
            <FormField
              name="licenciamento"
              label={campo('licenciamento')}
              tipo="moeda"
              className={TERCO}
            />
            <FormField
              name="seguroAnual"
              label={campo('seguroAnual')}
              tipo="moeda"
              className={TERCO}
            />
            <FormField
              name="vencimentoSeguro"
              label={campo('vencimentoSeguro')}
              tipo="data"
              className={METADE}
            />
          </Secao>

          <Secao titulo={t('veiculos.secoes.financiamento')}>
            <FormField
              name="banco"
              label={campo('banco')}
              placeholder={t('veiculos.placeholders.banco')}
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

          <FormField
            name="observacoes"
            label={campo('observacoes')}
            tipo="textarea"
            placeholder={t('veiculos.placeholders.observacoes')}
          />
        </div>
      </FormLayout>
    </Modal>
  );
}
