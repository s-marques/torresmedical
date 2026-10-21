import {
  PROFISSIONAL_CORES,
  PROFISSIONAL_COR_KEYS,
  PROFISSIONAL_DURACAO_PADRAO,
  PROFISSIONAL_ESTADO_CIVIL_ROTULOS,
  PROFISSIONAL_ESTADOS_CIVIS,
  PROFISSIONAL_LAYOUT_RECEITA_ROTULOS,
  PROFISSIONAL_LAYOUTS_RECEITA,
  createProfissionalSchema,
  type Profissional,
  type ProfissionalInput,
} from '@torres/shared';
import { useWatch } from 'react-hook-form';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { HorariosAtendimento } from './HorariosAtendimento';
import { SeletorImagem } from './SeletorImagem';
import {
  useCriarProfissional,
  useDefinirArquivoProfissional,
  useEditarProfissional,
} from './use-profissionais';

const ID_FORMULARIO = 'form-profissional';

const OPCOES_COR = PROFISSIONAL_COR_KEYS.map((valor) => ({
  valor,
  rotulo: PROFISSIONAL_CORES[valor].rotulo,
}));
const OPCOES_ESTADO_CIVIL = PROFISSIONAL_ESTADOS_CIVIS.map((valor) => ({
  valor,
  rotulo: PROFISSIONAL_ESTADO_CIVIL_ROTULOS[valor],
}));
const OPCOES_LAYOUT = PROFISSIONAL_LAYOUTS_RECEITA.map((valor) => ({
  valor,
  rotulo: PROFISSIONAL_LAYOUT_RECEITA_ROTULOS[valor],
}));

/** Valores iniciais do formulário: texto vazio para o que o profissional não tem. */
function valoresIniciais(p?: Profissional): ProfissionalInput {
  return {
    nome: p?.nome ?? '',
    especialidadeId: p?.especialidadeId ?? null,
    registro: p?.registro ?? '',
    outrasEspecialidades: p?.outrasEspecialidades ?? '',
    email: p?.email ?? '',
    telefone: p?.telefone ?? '',
    duracaoPadrao: p?.duracaoPadrao ?? PROFISSIONAL_DURACAO_PADRAO,
    valorConsulta: p?.valorConsulta ?? null,
    comissao: p?.comissao ?? null,
    corCalendario: p?.corCalendario ?? 'azul',
    cpf: p?.cpf ?? '',
    rg: p?.rg ?? '',
    dataNascimento: p?.dataNascimento ?? '',
    naturalidade: p?.naturalidade ?? '',
    estadoCivil: p?.estadoCivil ?? '',
    endereco: p?.endereco ?? '',
    enderecoConsultorio: p?.enderecoConsultorio ?? '',
    telefoneReceita: p?.telefoneReceita ?? '',
    cnes: p?.cnes ?? '',
    rodapeReceita: p?.rodapeReceita ?? '',
    layoutReceita: p?.layoutReceita ?? 'PADRAO',
    memedApiToken: p?.memedApiToken ?? '',
    // A Secret Key nunca volta da API: em branco mantém a gravada.
    memedSecretKey: '',
  };
}

function Secao({
  titulo,
  nota,
  children,
}: Readonly<{ titulo: string; nota?: string; children: React.ReactNode }>) {
  return (
    <section className="grid gap-4 border-t pt-4 sm:col-span-2 sm:grid-cols-2">
      <div className="flex items-baseline justify-between gap-2 sm:col-span-2">
        <h3 className="text-sm font-semibold">{titulo}</h3>
        {nota && <span className="text-xs text-muted-foreground">{nota}</span>}
      </div>
      {children}
    </section>
  );
}

export interface ModalProfissionalProps {
  /** Sem profissional: "Novo Profissional" (Cadastrar). Com profissional: "Editar Profissional" (Salvar). */
  profissional?: Profissional;
  onFechar: () => void;
}

/** Modal "Novo Profissional" e "Editar Profissional". Foto, logo, Memed e horários só depois de cadastrar. */
export function ModalProfissional({ profissional, onFechar }: Readonly<ModalProfissionalProps>) {
  const criar = useCriarProfissional();
  const editar = useEditarProfissional(profissional?.id ?? '');
  const definirArquivo = useDefinirArquivoProfissional(profissional?.id ?? '');
  const form = useFormulario(createProfissionalSchema, {
    defaultValues: valoresIniciais(profissional),
  });
  const cor = useWatch({ control: form.control, name: 'corCalendario' });
  const editando = profissional !== undefined;

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={editando ? 'Editar Profissional' : 'Novo Profissional'}
      tamanho="lg"
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={editando ? 'Salvar' : 'Cadastrar'}
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
          // Os dois aceitam o mesmo corpo; a API devolve o profissional já normalizado.
          await (editando ? editar : criar).mutateAsync(valores as ProfissionalInput);
          onFechar();
        }}
      >
        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-[auto_1fr]">
          <SeletorImagem
            uso="foto-profissional"
            redondo
            rotulo="Alterar foto"
            dicaDesabilitado="Salve primeiro"
            desabilitado={!editando}
            arquivoId={profissional?.fotoArquivoId ?? null}
            onEnviado={(arquivoId) => definirArquivo.mutateAsync({ campo: 'foto', arquivoId })}
          />
          <FormField name="nome" label="Nome" obrigatorio placeholder="Nome completo" />
        </div>

        <FormField
          name="especialidadeId"
          label="Especialidade"
          tipo="entidade"
          entidade="especialidades"
          placeholder="Selecione"
        />
        <FormField name="registro" label="Registro (CRM/CRO)" placeholder="CRM/CRO 00000" />
        <FormField
          name="outrasEspecialidades"
          label="Outras Especialidades / Áreas de Atuação"
          placeholder="Ex: Otorrinolaringologia, Cirurgia, Endocrinologia..."
          descricao="Especialidades adicionais separadas por vírgula. Usado pelo agente IA para encontrar o profissional."
          className="sm:col-span-2"
        />
        <FormField name="email" label="Email" tipo="email" placeholder="email@exemplo.com" />
        <FormField name="telefone" label="Telefone" tipo="telefone" />
        <FormField name="duracaoPadrao" label="Duração padrão (min)" tipo="numero" />
        <FormField
          name="valorConsulta"
          label="Valor da consulta (R$)"
          tipo="numero"
          placeholder="150.00"
        />
        <FormField name="comissao" label="Comissão (%)" tipo="numero" placeholder="0" />
        <div className="flex items-end gap-2">
          <span
            aria-hidden
            data-testid="cor-calendario"
            className="mb-0.5 size-9 shrink-0 rounded-md border"
            style={{ backgroundColor: PROFISSIONAL_CORES[cor ?? 'azul'].hex }}
          />
          <FormField
            name="corCalendario"
            label="Cor no calendário"
            tipo="select"
            opcoes={OPCOES_COR}
            className="flex-1"
          />
        </div>

        <Secao titulo="Dados Pessoais" nota="Para confecção de contratos">
          <FormField name="cpf" label="CPF" tipo="cpf" />
          <FormField name="rg" label="RG" placeholder="Número do RG" />
          <FormField name="dataNascimento" label="Data de Nascimento" tipo="data" />
          <FormField name="naturalidade" label="Naturalidade" placeholder="Cidade/Estado" />
          <FormField
            name="estadoCivil"
            label="Estado Civil"
            tipo="select"
            opcoes={OPCOES_ESTADO_CIVIL}
          />
          <FormField name="endereco" label="Endereço" placeholder="Rua, nº - Bairro - Cidade/UF" />
        </Secao>

        <Secao titulo="Dados para Impressão de Receita">
          <FormField
            name="enderecoConsultorio"
            label="Endereço do Consultório"
            placeholder="Rua X, 123 - Centro - Cuiabá/MT"
            className="sm:col-span-2"
          />
          <FormField name="telefoneReceita" label="Telefone para Receita" tipo="telefone" />
          <FormField name="cnes" label="CNES" placeholder="Código CNES" />
          <div className="grid gap-2 sm:col-span-2">
            <span className="text-sm font-medium">Logo para Receita</span>
            <SeletorImagem
              uso="logo-receita"
              rotulo="Enviar"
              dicaDesabilitado="Salve o profissional primeiro, depois envie a logo."
              desabilitado={!editando}
              arquivoId={profissional?.logoReceitaArquivoId ?? null}
              onEnviado={(arquivoId) =>
                definirArquivo.mutateAsync({ campo: 'logo-receita', arquivoId })
              }
            />
          </div>
          <FormField
            name="rodapeReceita"
            label="Rodapé da Receita (texto)"
            placeholder="Texto que aparece no rodapé (usado no layout Padrao)"
            className="sm:col-span-2"
          />
          <FormField
            name="layoutReceita"
            label="Layout da Receita"
            tipo="select"
            opcoes={OPCOES_LAYOUT}
            descricao="Controle especial sempre usa modelo padrão ANVISA."
            className="sm:col-span-2"
          />
        </Secao>

        {editando && (
          <Secao titulo="Receita Digital (Memed)">
            <FormField name="memedApiToken" label="API Token (Memed)" />
            <FormField
              name="memedSecretKey"
              label="Secret Key (Memed)"
              tipo="senha"
              placeholder={profissional.memedSecretKeyDefinida ? '••••••••••' : undefined}
              descricao="Configure as credenciais Memed para habilitar receita digital neste profissional. Em branco, mantém a chave já salva."
            />
          </Secao>
        )}
      </FormLayout>
      {editando && (
        <div className="mt-4 grid gap-4 border-t pt-4">
          <HorariosAtendimento profissionalId={profissional.id} />
        </div>
      )}
    </Modal>
  );
}
