import { createLicencaSchema, type Licenca, type LicencaFormInput } from '@torres/shared';
import { useTranslation } from 'react-i18next';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useCriarLicenca, useEditarLicenca, useTiposLicenca } from './use-alvaras-licencas';

const ID_FORMULARIO = 'form-licenca';

export interface ModalLicencaProps {
  /** Sem licença: "Nova Licenca". Com licença: edição. */
  licenca?: Licenca;
  /** Unidade escolhida no filtro da tela, sugerida na criação. */
  unidadeIdPadrao?: string;
  onFechar: () => void;
}

function valoresIniciais(l: Licenca | undefined, unidadeIdPadrao: string): LicencaFormInput {
  return {
    unidadeId: l?.unidadeId ?? unidadeIdPadrao,
    tipoLicencaId: l?.tipoLicencaId ?? '',
    naoSeAplica: l?.naoSeAplica ?? false,
    numeroDocumento: l?.numeroDocumento ?? '',
    orgaoEmissor: l?.orgaoEmissor ?? '',
    titular: l?.titular ?? '',
    dataEmissao: l?.dataEmissao ?? '',
    dataVencimento: l?.dataVencimento ?? '',
    telefone: l?.telefone ?? '',
    email: l?.email ?? '',
    departamento: l?.departamento ?? '',
    plataformaOnline: l?.plataformaOnline ?? false,
    comoRenovar: l?.comoRenovar ?? '',
    documentosObrigatorios: l?.documentosObrigatorios ?? '',
    enderecoPresencial: l?.enderecoPresencial ?? '',
    horarioAtendimento: l?.horarioAtendimento ?? '',
    prazoAnalise: l?.prazoAnalise ?? '',
    responsavel: l?.responsavel ?? '',
    observacoes: l?.observacoes ?? '',
  };
}

/** Modal "Nova Licenca" e edição. Obrigatórios: Unidade e Tipo de Licença. */
export function ModalLicenca({
  licenca,
  unidadeIdPadrao = '',
  onFechar,
}: Readonly<ModalLicencaProps>) {
  const { t } = useTranslation();
  const criar = useCriarLicenca();
  const editar = useEditarLicenca(licenca?.id ?? '');
  const tipos = useTiposLicenca();
  const form = useFormulario(createLicencaSchema, {
    defaultValues: valoresIniciais(licenca, unidadeIdPadrao),
  });
  const opcoesTipos = (tipos.data ?? []).map((tipo) => ({ valor: tipo.id, rotulo: tipo.nome }));
  const c = (chave: string) => t(`alvarasLicencas.campos.${chave}`);

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={
        licenca ? t('alvarasLicencas.editarLicencaTitulo') : t('alvarasLicencas.novaLicencaTitulo')
      }
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={licenca ? t('comum.salvar') : t('alvarasLicencas.cadastrar')}
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        colunas={2}
        onSubmit={async (valores) => {
          await (licenca ? editar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField
          name="unidadeId"
          label={c('unidade')}
          tipo="entidade"
          entidade="unidades"
          obrigatorio
        />
        <FormField
          name="tipoLicencaId"
          label={c('tipoLicenca')}
          tipo="select"
          opcoes={opcoesTipos}
          obrigatorio
        />
        <FormField
          name="naoSeAplica"
          label={c('naoSeAplica')}
          tipo="switch"
          className="sm:col-span-2"
        />

        <Secao titulo={t('alvarasLicencas.secoes.documento')} />
        <FormField name="numeroDocumento" label={c('numeroDocumento')} />
        <FormField name="orgaoEmissor" label={c('orgaoEmissor')} />
        <FormField name="titular" label={c('titular')} />
        <FormField name="dataEmissao" label={c('dataEmissao')} tipo="data" />
        <FormField name="dataVencimento" label={c('dataVencimento')} tipo="data" />

        <Secao titulo={t('alvarasLicencas.secoes.contato')} />
        <FormField name="telefone" label={c('telefone')} />
        <FormField name="email" label={c('email')} tipo="email" />
        <FormField name="departamento" label={c('departamento')} />

        <Secao titulo={t('alvarasLicencas.secoes.renovacao')} />
        <FormField
          name="plataformaOnline"
          label={c('plataformaOnline')}
          tipo="switch"
          className="sm:col-span-2"
        />
        <FormField
          name="comoRenovar"
          label={c('comoRenovar')}
          tipo="textarea"
          className="sm:col-span-2"
        />
        <FormField
          name="documentosObrigatorios"
          label={c('documentosObrigatorios')}
          tipo="textarea"
          className="sm:col-span-2"
        />
        <FormField name="enderecoPresencial" label={c('enderecoPresencial')} />
        <FormField name="horarioAtendimento" label={c('horarioAtendimento')} />
        <FormField name="prazoAnalise" label={c('prazoAnalise')} />
        <FormField name="responsavel" label={c('responsavel')} />
        <FormField
          name="observacoes"
          label={c('observacoes')}
          tipo="textarea"
          className="sm:col-span-2"
        />
      </FormLayout>
    </Modal>
  );
}

function Secao({ titulo }: Readonly<{ titulo: string }>) {
  return <h3 className="text-sm font-medium text-muted-foreground sm:col-span-2">{titulo}</h3>;
}
