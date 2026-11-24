import {
  PACIENTE_POSSIVEL_DUPLICADO,
  PACIENTE_SEXO_ROTULOS,
  PACIENTE_SEXOS,
  PACIENTE_STATUS,
  PACIENTE_STATUS_ROTULOS,
  PACIENTE_TIPO_ROTULOS,
  PACIENTE_TIPOS,
  createPacienteSchema,
  type Paciente,
  type PacienteInput,
  type PacientePossivelDuplicado,
  type PacienteTipo,
} from '@torres/shared';
import { useRef, useState, type FocusEvent } from 'react';
import { useController, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { ApiRequestError } from '@/lib/api/api-error';
import { cn } from '@/lib/utils';
import { AlertaDuplicidade } from './AlertaDuplicidade';
import { CamposRelacionamento } from './CamposRelacionamento';
import { ConsentimentosNovoPaciente } from './ConsentimentosNovoPaciente';
import {
  ESCOLHAS_VAZIAS,
  montarConsentimentos,
  type EscolhasConsentimento,
} from './escolhas-consentimento';
import {
  useCriarPaciente,
  useEditarPaciente,
  verificarDuplicidade,
  type DadosIdentificacao,
} from './use-pacientes';

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
    canalOrigem: paciente?.canalOrigem ?? '',
    whatsapp: paciente?.whatsapp ?? '',
    preferenciaComunicacao: paciente?.preferenciaComunicacao ?? '',
    indicacaoTipo: paciente?.indicacaoTipo ?? '',
    indicacaoReferenciaId: paciente?.indicacaoReferenciaId ?? null,
    indicacaoTexto: paciente?.indicacaoTexto ?? '',
    profissionalVinculoId: paciente?.profissionalVinculoId ?? null,
    especialidadeVinculoId: paciente?.especialidadeVinculoId ?? null,
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

/** Campos que identificam o paciente: ao sair de um deles, procura possíveis duplicados (#149). */
const CAMPOS_IDENTIFICACAO = new Set(['nome', 'email', 'telefone', 'celular', 'dataNascimento']);

function identificacao(valores: Partial<PacienteInput>): DadosIdentificacao {
  return {
    nome: valores.nome?.trim() || null,
    email: valores.email?.trim() || null,
    telefone: valores.telefone || null,
    celular: valores.celular || null,
    dataNascimento: valores.dataNascimento || null,
  };
}

/** Assinatura dos dados conferidos: o que já foi conferido ou confirmado não alerta de novo. */
const assinaturaDe = (dados: DadosIdentificacao) => JSON.stringify(dados);

interface AlertaAberto {
  candidatos: PacientePossivelDuplicado[];
  /** Veio do "Cadastrar/Salvar" (continuar grava) ou de sair do campo (continuar só fecha). */
  aoSalvar: boolean;
}

export interface ModalPacienteProps {
  /** Sem paciente: "Novo Paciente". Com paciente: "Editar Paciente". */
  paciente?: Paciente;
  onFechar: () => void;
  /** "Abrir registro existente" do alerta de duplicidade: abre o paciente escolhido. */
  onAbrirExistente: (id: string) => Promise<unknown> | void;
}

/** Modal "Novo Paciente" e "Editar Paciente": pessoa física ou jurídica, com endereço. */
export function ModalPaciente({
  paciente,
  onFechar,
  onAbrirExistente,
}: Readonly<ModalPacienteProps>) {
  const [alerta, setAlerta] = useState<AlertaAberto | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const confirmada = useRef<string | null>(null);
  const conferida = useRef<string | null>(null);
  const criar = useCriarPaciente();
  const editar = useEditarPaciente(paciente?.id ?? '');
  const form = useFormulario(createPacienteSchema, { defaultValues: valoresIniciais(paciente) });
  const { t } = useTranslation();
  // Cadastro novo: os consentimentos são escolhidos aqui (explícitos, com canal). Na edição ficam
  // no detalhe do paciente, para o histórico não ser sobrescrito.
  const [escolhas, setEscolhas] = useState<EscolhasConsentimento>(ESCOLHAS_VAZIAS);
  const [mostrarErros, setMostrarErros] = useState(false);
  const tipo = useWatch({ control: form.control, name: 'tipo' }) ?? 'PF';
  const pf = tipo === 'PF';

  /** Falha na consulta não trava o cadastro: a API confere de novo ao gravar. */
  async function conferir(dados: DadosIdentificacao): Promise<PacientePossivelDuplicado[]> {
    try {
      return await verificarDuplicidade(dados, paciente?.id);
    } catch {
      return [];
    }
  }

  async function aoSairDoCampo(evento: FocusEvent<HTMLElement>) {
    if (alerta || !CAMPOS_IDENTIFICACAO.has((evento.target as HTMLInputElement).name)) return;
    const dados = identificacao(form.getValues());
    const assinatura = assinaturaDe(dados);
    if (assinatura === confirmada.current || assinatura === conferida.current) return;
    conferida.current = assinatura;
    const candidatos = await conferir(dados);
    const mudou = assinaturaDe(identificacao(form.getValues())) !== assinatura;
    if (candidatos.length > 0 && !mudou) setAlerta({ candidatos, aoSalvar: false });
  }

  /** Confere o duplicado, grava e fecha; sem a confirmação do usuário, mostra o alerta. */
  async function salvar(valores: PacienteInput): Promise<void> {
    const dados = identificacao(valores);
    const confirmado = confirmada.current === assinaturaDe(dados);
    if (!confirmado) {
      const candidatos = await conferir(dados);
      if (candidatos.length > 0) {
        setAlerta({ candidatos, aoSalvar: true });
        return;
      }
    }
    try {
      // Os dois aceitam o mesmo corpo; a API devolve o paciente já normalizado.
      await (paciente ? editar : criar).mutateAsync({
        ...valores,
        duplicidadeConfirmada: confirmado || undefined,
      });
    } catch (erro) {
      // Alguém cadastrou um parecido entre a consulta e o envio: mostra o alerta.
      if (erro instanceof ApiRequestError && erro.body?.code === PACIENTE_POSSIVEL_DUPLICADO) {
        const candidatos = await conferir(dados);
        if (candidatos.length > 0) {
          setAlerta({ candidatos, aoSalvar: true });
          return;
        }
      }
      throw erro;
    }
    onFechar();
  }

  function continuarCadastro() {
    confirmada.current = assinaturaDe(identificacao(form.getValues()));
    const salvando = alerta?.aoSalvar ?? false;
    setAlerta(null);
    if (salvando) {
      (document.getElementById(ID_FORMULARIO) as HTMLFormElement | null)?.requestSubmit();
    }
  }

  async function abrirExistente(id: string) {
    setAbrindo(true);
    try {
      await onAbrirExistente(id);
    } finally {
      setAbrindo(false);
    }
  }

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
          const consentimentos = paciente ? undefined : montarConsentimentos(escolhas);
          if (!paciente && !consentimentos) {
            setMostrarErros(true);
            return;
          }
          await salvar({
            ...(valores as PacienteInput),
            ...(consentimentos ? { consentimentos } : {}),
          });
        }}
      >
        <div className="contents" onBlur={(evento) => void aoSairDoCampo(evento)}>
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
                <legend className="px-1 text-sm font-medium text-primary">
                  Representante Legal
                </legend>
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
          <CamposRelacionamento />
          {paciente ? (
            <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground sm:col-span-2">
              {t('pacientes.consentimentos.cadastro.edicao')}
            </p>
          ) : (
            <ConsentimentosNovoPaciente
              valor={escolhas}
              onChange={setEscolhas}
              mostrarErros={mostrarErros}
            />
          )}

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
        </div>
      </FormLayout>
      {alerta && (
        <AlertaDuplicidade
          candidatos={alerta.candidatos}
          ocupado={abrindo}
          onAbrir={(id) => void abrirExistente(id)}
          onContinuar={continuarCadastro}
          onFechar={() => setAlerta(null)}
        />
      )}
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
