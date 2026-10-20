import {
  PACIENTE_SEXO_ROTULOS,
  PACIENTE_SEXOS,
  PACIENTE_STATUS,
  PACIENTE_STATUS_ROTULOS,
  PACIENTE_TIPO_ROTULOS,
  PACIENTE_TIPOS,
  createPacienteSchema,
  type Paciente,
  type PacienteInput,
  type PacienteTipo,
} from '@torres/shared';
import { useController, useWatch } from 'react-hook-form';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { cn } from '@/lib/utils';
import { useCriarPaciente, useEditarPaciente } from './use-pacientes';

const ID_FORMULARIO = 'form-paciente';

const OPCOES_SEXO = PACIENTE_SEXOS.map((valor) => ({
  valor,
  rotulo: PACIENTE_SEXO_ROTULOS[valor],
}));
const OPCOES_STATUS = PACIENTE_STATUS.map((valor) => ({
  valor,
  rotulo: PACIENTE_STATUS_ROTULOS[valor],
}));

/** Valores iniciais do formulário: texto vazio para o que o paciente não tem. */
function valoresIniciais(paciente?: Paciente): PacienteInput {
  return {
    tipo: paciente?.tipo ?? 'PF',
    nome: paciente?.nome ?? '',
    nomeSocial: paciente?.nomeSocial ?? '',
    email: paciente?.email ?? '',
    documento: paciente?.documento ?? '',
    rg: paciente?.rg ?? '',
    menorIdade: paciente?.menorIdade ?? false,
    telefone: paciente?.telefone ?? '',
    celular: paciente?.celular ?? '',
    dataNascimento: paciente?.dataNascimento ?? '',
    sexo: paciente?.sexo ?? '',
    profissao: paciente?.profissao ?? '',
    origemClienteId: paciente?.origemClienteId ?? null,
    status: paciente?.status ?? 'ATIVO',
    observacoes: paciente?.observacoes ?? '',
    aceitaCampanhasWhatsapp: paciente?.aceitaCampanhasWhatsapp ?? true,
    razaoSocial: paciente?.razaoSocial ?? '',
    nomeFantasia: paciente?.nomeFantasia ?? '',
    inscricaoEstadual: paciente?.inscricaoEstadual ?? '',
    representanteNome: paciente?.representanteNome ?? '',
    representanteCelular: paciente?.representanteCelular ?? '',
    cep: paciente?.cep ?? '',
    logradouro: paciente?.logradouro ?? '',
    numero: paciente?.numero ?? '',
    complemento: paciente?.complemento ?? '',
    bairro: paciente?.bairro ?? '',
    cidade: paciente?.cidade ?? '',
    uf: paciente?.uf ?? '',
    codigoIbge: paciente?.codigoIbge ?? '',
  };
}

export interface ModalPacienteProps {
  /** Sem paciente: "Novo Paciente". Com paciente: "Editar Paciente". */
  paciente?: Paciente;
  onFechar: () => void;
}

/** Modal "Novo Paciente" e "Editar Paciente": pessoa física ou jurídica, com endereço. */
export function ModalPaciente({ paciente, onFechar }: Readonly<ModalPacienteProps>) {
  const criar = useCriarPaciente();
  const editar = useEditarPaciente(paciente?.id ?? '');
  const form = useFormulario(createPacienteSchema, { defaultValues: valoresIniciais(paciente) });
  const tipo = useWatch({ control: form.control, name: 'tipo' }) ?? 'PF';
  const pf = tipo === 'PF';

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={paciente ? 'Editar Paciente' : 'Novo Paciente'}
      tamanho="lg"
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={paciente ? 'Salvar' : 'Cadastrar'}
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        colunas={2}
        acoes={null}
        onSubmit={async (valores) => {
          // Os dois aceitam o mesmo corpo; a API devolve o paciente já normalizado.
          await (paciente ? editar : criar).mutateAsync(valores as PacienteInput);
          onFechar();
        }}
      >
        <FormField
          name="nome"
          label="Nome"
          obrigatorio
          placeholder={pf ? 'Nome completo' : 'Nome do cliente'}
          className="sm:col-span-2"
        />
        <FormField
          name="nomeSocial"
          label="Nome Social"
          placeholder="Nome social (opcional)"
          className="sm:col-span-2"
        />
        <SeletorTipoPessoa />

        <FormField name="email" label="Email" tipo="email" placeholder="email@exemplo.com" />
        <FormField
          name="documento"
          label={pf ? 'CPF' : 'CNPJ'}
          tipo={pf ? 'cpf' : 'cnpj'}
          key={tipo}
        />

        {pf ? (
          <>
            <FormField name="rg" label="RG" />
            <FormField name="menorIdade" label="Menor de idade" tipo="checkbox" />
          </>
        ) : (
          <>
            <FormField
              name="razaoSocial"
              label="Razão Social"
              placeholder="Razão social da empresa"
            />
            <FormField name="nomeFantasia" label="Nome Fantasia" placeholder="Nome fantasia" />
            <FormField
              name="inscricaoEstadual"
              label="Inscrição Estadual"
              placeholder="Inscrição estadual (opcional)"
              className="sm:col-span-2"
            />
            <fieldset className="grid gap-4 rounded-md border bg-muted/40 p-4 sm:col-span-2 sm:grid-cols-2">
              <legend className="px-1 text-sm font-medium text-primary">Representante Legal</legend>
              <FormField
                name="representanteNome"
                label="Nome do Representante"
                placeholder="Nome completo"
              />
              <FormField
                name="representanteCelular"
                label="Celular do Representante"
                tipo="telefone"
              />
            </fieldset>
          </>
        )}

        <FormField name="telefone" label="Telefone" tipo="telefone" />
        <FormField name="celular" label="Celular" tipo="telefone" />
        <FormField
          name="dataNascimento"
          label={pf ? 'Data de Nascimento' : 'Data de Fundação'}
          tipo="data"
        />
        {pf && <FormField name="sexo" label="Sexo" tipo="select" opcoes={OPCOES_SEXO} />}
        <FormField name="profissao" label="Profissão" />
        <FormField
          name="origemClienteId"
          label="Origem"
          tipo="entidade"
          entidade="origens-cliente"
        />
        <FormField
          name="status"
          label="Status"
          tipo="select"
          opcoes={OPCOES_STATUS}
          className="sm:col-span-2"
        />
        <FormField
          name="observacoes"
          label="Observações"
          tipo="textarea"
          placeholder="Observações sobre o paciente..."
          className="sm:col-span-2"
        />
        <div className="rounded-md border p-3 sm:col-span-2">
          <FormField
            name="aceitaCampanhasWhatsapp"
            label="Aceita receber campanhas por WhatsApp"
            tipo="checkbox"
            descricao="Desmarque quando o paciente pedir para não receber mais mensagens (LGPD). Ele continua recebendo confirmações de agendamento e atendimento normal."
          />
        </div>

        <fieldset className="grid gap-4 border-t pt-4 sm:col-span-2 sm:grid-cols-2">
          <legend className="pr-2 text-sm font-semibold">Endereço</legend>
          <FormField name="cep" label="CEP" tipo="cep" />
          <FormField name="logradouro" label="Logradouro" placeholder="Rua, Av..." />
          <FormField name="numero" label="Número" placeholder="Nº" />
          <FormField name="complemento" label="Complemento" placeholder="Apto, Sala..." />
          <FormField name="bairro" label="Bairro" />
          <FormField name="cidade" label="Cidade" />
          <FormField name="uf" label="UF" placeholder="MT" />
          <FormField name="codigoIbge" label="Cód. IBGE" placeholder="5103403" />
        </fieldset>
      </FormLayout>
    </Modal>
  );
}

/** Botões Pessoa Física / Pessoa Jurídica (o tipo define os campos do documento e da empresa). */
function SeletorTipoPessoa() {
  const { field } = useController<PacienteInput, 'tipo'>({ name: 'tipo' });
  return (
    <div className="grid gap-2 sm:col-span-2">
      <span id="tipo-pessoa" className="text-sm leading-none font-medium">
        Tipo de Pessoa
      </span>
      <div role="radiogroup" aria-labelledby="tipo-pessoa" className="grid grid-cols-2 gap-2">
        {PACIENTE_TIPOS.map((opcao: PacienteTipo) => (
          <button
            key={opcao}
            type="button"
            role="radio"
            aria-checked={field.value === opcao}
            onClick={() => field.onChange(opcao)}
            className={cn(
              'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
              field.value === opcao
                ? 'border-primary bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent',
            )}
          >
            {PACIENTE_TIPO_ROTULOS[opcao]}
          </button>
        ))}
      </div>
    </div>
  );
}
