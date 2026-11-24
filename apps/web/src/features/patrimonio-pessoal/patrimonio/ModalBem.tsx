import { BEM_TIPOS, createBemSchema, type Bem, type BemFormInput } from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { useWatch } from 'react-hook-form';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useCriarBem, useEditarBem } from './use-patrimonio';

const ID_FORMULARIO = 'form-bem';

/** Grade de 6 colunas: campos de metade (3), de um terço (2) ou de linha inteira (6), como no print. */
const METADE = 'sm:col-span-3';
const TERCO = 'sm:col-span-2';
const LINHA = 'sm:col-span-6';

export interface ModalBemProps {
  /** Sem bem: "Novo Bem". Com bem: "Editar Bem". */
  bem?: Bem;
  onFechar: () => void;
}

function valoresIniciais(b?: Bem): BemFormInput {
  return {
    produtoId: b?.produtoId ?? null,
    descricao: b?.descricao ?? '',
    tipo: b?.tipo ?? 'AUTOMOVEL',
    valorCompra: b?.valorCompra ?? null,
    dataAquisicao: b?.dataAquisicao ?? '',
    marca: b?.marca ?? '',
    modelo: b?.modelo ?? '',
    ano: b?.ano ?? null,
    placa: b?.placa ?? '',
    renavam: b?.renavam ?? '',
    financiado: b?.financiado ?? false,
    possuiSeguro: b?.possuiSeguro ?? false,
  };
}

/** Seção "Dados do Veículo": aparece só quando o Tipo é Automóvel (print do inventário). */
function DadosVeiculo() {
  const { t } = useTranslation();
  const tipo = useWatch({ name: 'tipo' });
  const campo = (nome: keyof BemFormInput) => t(`patrimonio.campos.${nome}`);
  if (tipo !== 'AUTOMOVEL') return null;

  return (
    <fieldset className="grid gap-4 sm:grid-cols-6">
      <legend className="text-muted-foreground mb-4 text-sm font-medium">
        {t('patrimonio.secoes.veiculo')}
      </legend>
      <FormField name="marca" label={campo('marca')} className={TERCO} />
      <FormField name="modelo" label={campo('modelo')} className={TERCO} />
      <FormField name="ano" label={campo('ano')} tipo="numero" className={TERCO} />
      <FormField
        name="placa"
        label={campo('placa')}
        placeholder={t('patrimonio.placeholders.placa')}
        className={METADE}
      />
      <FormField name="renavam" label={campo('renavam')} className={METADE} />
      <FormField name="financiado" label={campo('financiado')} tipo="switch" className={LINHA} />
      <FormField
        name="possuiSeguro"
        label={campo('possuiSeguro')}
        tipo="switch"
        className={LINHA}
      />
    </fieldset>
  );
}

/**
 * Modal "Novo Bem" e "Editar Bem" (print do inventário). Só a Descrição é obrigatória; a seção
 * "Dados do Veículo" só existe para o tipo Automóvel. O campo "Cliente ID" do sistema atual não
 * entra (decisão do dev na #62).
 */
export function ModalBem({ bem, onFechar }: Readonly<ModalBemProps>) {
  const { t } = useTranslation();
  const criar = useCriarBem();
  const editar = useEditarBem(bem?.id ?? '');
  const form = useFormulario(createBemSchema, { defaultValues: valoresIniciais(bem) });
  const opcoesTipo = BEM_TIPOS.map((valor) => ({ valor, rotulo: t(`patrimonio.tipos.${valor}`) }));
  const campo = (nome: keyof BemFormInput) => t(`patrimonio.campos.${nome}`);

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={bem ? t('patrimonio.editar') : t('patrimonio.novo')}
      tamanho="lg"
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={bem ? t('comum.salvar') : t('patrimonio.cadastrar')}
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await (bem ? editar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <div className="grid gap-6">
          <FormField
            name="produtoId"
            label={campo('produtoId')}
            tipo="entidade"
            entidade="produtos"
            descricao={t('patrimonio.ajudas.produtoId')}
          />
          <div className="grid gap-4 sm:grid-cols-6">
            <FormField
              name="descricao"
              label={campo('descricao')}
              obrigatorio
              placeholder={t('patrimonio.placeholders.descricao')}
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
              name="valorCompra"
              label={campo('valorCompra')}
              tipo="moeda"
              className={METADE}
            />
            <FormField
              name="dataAquisicao"
              label={campo('dataAquisicao')}
              tipo="data"
              className={METADE}
            />
          </div>
          <DadosVeiculo />
        </div>
      </FormLayout>
    </Modal>
  );
}
