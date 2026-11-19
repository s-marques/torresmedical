import { createPrestadorSchema, type Prestador, type PrestadorFormInput } from '@torres/shared';
import { useState } from 'react';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  OPCOES_AVALIACAO_PRECO,
  OPCOES_CATEGORIA,
  OPCOES_FORMA_PAGAMENTO,
  OPCOES_NOTA,
  OPCOES_STATUS,
  OPCOES_TIPO_PESSOA,
} from './opcoes';
import { useCriarPrestador, useEditarPrestador } from './use-prestadores';

const ID_FORMULARIO = 'form-prestador';

type Campo = keyof PrestadorFormInput;
type Aba = 'dados' | 'servico' | 'comercial' | 'avaliacao';

/** Abas do modal (prints do dev na #40) e os campos de cada uma. */
const ABAS: readonly { valor: Aba; rotulo: string; campos: readonly Campo[] }[] = [
  {
    valor: 'dados',
    rotulo: 'Dados',
    campos: [
      'nome',
      'nomeFantasia',
      'tipoPessoa',
      'documento',
      'telefone',
      'email',
      'status',
      'endereco',
    ],
  },
  {
    valor: 'servico',
    rotulo: 'Serviço',
    campos: ['categoria', 'descricaoServico', 'atendeUrgencia', 'atendeFimSemana'],
  },
  {
    valor: 'comercial',
    rotulo: 'Comercial',
    campos: ['formaPagamento', 'chavePix', 'valorHora', 'valorDiaria', 'emiteNotaFiscal'],
  },
  {
    valor: 'avaliacao',
    rotulo: 'Avaliação',
    campos: ['notaQualidade', 'notaPontualidade', 'avaliacaoPreco', 'observacoes'],
  },
];

/** Interruptor em cartão, com a descrição abaixo do rótulo, como nos prints. */
const CARTAO_SWITCH = 'rounded-lg border p-3 sm:col-span-2';

export interface ModalPrestadorProps {
  /** Sem prestador: "Novo Prestador". Com prestador: "Editar Prestador". */
  prestador?: Prestador;
  onFechar: () => void;
}

function valoresIniciais(p?: Prestador): PrestadorFormInput {
  return {
    nome: p?.nome ?? '',
    nomeFantasia: p?.nomeFantasia ?? '',
    tipoPessoa: p?.tipoPessoa ?? 'FISICA',
    documento: p?.documento ?? '',
    telefone: p?.telefone ?? '',
    email: p?.email ?? '',
    status: p?.status ?? 'ATIVO',
    endereco: p?.endereco ?? '',
    categoria: p?.categoria ?? 'ELETRICA',
    descricaoServico: p?.descricaoServico ?? '',
    atendeUrgencia: p?.atendeUrgencia ?? false,
    atendeFimSemana: p?.atendeFimSemana ?? false,
    formaPagamento: p?.formaPagamento ?? 'PIX',
    chavePix: p?.chavePix ?? '',
    valorHora: p?.valorHora ?? null,
    valorDiaria: p?.valorDiaria ?? null,
    emiteNotaFiscal: p?.emiteNotaFiscal ?? false,
    notaQualidade: String(p?.notaQualidade ?? 3),
    notaPontualidade: String(p?.notaPontualidade ?? 3),
    avaliacaoPreco: p?.avaliacaoPreco ?? 'JUSTO',
    observacoes: p?.observacoes ?? '',
  };
}

/**
 * Modal "Novo Prestador" e "Editar Prestador", com as abas Dados, Serviço, Comercial e Avaliação.
 * Só o Nome é obrigatório. Todas as abas ficam montadas (só a ativa aparece) para validar o
 * formulário inteiro; com erro numa aba escondida, o modal mostra essa aba.
 */
export function ModalPrestador({ prestador, onFechar }: Readonly<ModalPrestadorProps>) {
  const criar = useCriarPrestador();
  const editar = useEditarPrestador(prestador?.id ?? '');
  const form = useFormulario(createPrestadorSchema, {
    defaultValues: valoresIniciais(prestador),
  });
  const [aba, setAba] = useState<Aba>('dados');
  const pix = form.watch('formaPagamento') === 'PIX';

  // Erro novo (do Zod ou do servidor) só em abas escondidas: mostra a primeira delas.
  const camposComErro = Object.keys(form.formState.errors)
    .filter((campo) => campo !== 'root')
    .join(',');
  const [errosVistos, setErrosVistos] = useState('');
  if (camposComErro !== errosVistos) {
    setErrosVistos(camposComErro);
    const comErro = new Set(camposComErro.split(','));
    const temErro = (valor: Aba) =>
      ABAS.find((a) => a.valor === valor)?.campos.some((c) => comErro.has(c)) ?? false;
    const primeira = ABAS.find((a) => temErro(a.valor));
    if (primeira && !temErro(aba)) setAba(primeira.valor);
  }

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={prestador ? 'Editar Prestador' : 'Novo Prestador'}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={prestador ? 'Salvar' : 'Cadastrar'}
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await (prestador ? editar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <Tabs value={aba} onValueChange={(valor) => setAba(valor as Aba)} className="gap-4">
          <TabsList className="w-full">
            {ABAS.map(({ valor, rotulo }) => (
              <TabsTrigger key={valor} value={valor}>
                {rotulo}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="dados" forceMount hidden={aba !== 'dados'}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                name="nome"
                label="Nome"
                obrigatorio
                placeholder="Nome completo ou razão social"
                className="sm:col-span-2"
              />
              <FormField name="nomeFantasia" label="Nome Fantasia" placeholder="Nome fantasia" />
              <FormField
                name="tipoPessoa"
                label="Tipo Pessoa"
                tipo="select"
                opcoes={OPCOES_TIPO_PESSOA}
              />
              <FormField
                name="documento"
                label="CPF/CNPJ"
                tipo="cpf-cnpj"
                placeholder="Somente números"
              />
              <FormField
                name="telefone"
                label="Telefone"
                tipo="telefone"
                placeholder="(00) 00000-0000"
              />
              <FormField name="email" label="Email" tipo="email" placeholder="email@exemplo.com" />
              <FormField name="status" label="Status" tipo="select" opcoes={OPCOES_STATUS} />
              <FormField
                name="endereco"
                label="Endereço"
                placeholder="Rua, número, bairro, cidade"
                className="sm:col-span-2"
              />
            </div>
          </TabsContent>

          <TabsContent value="servico" forceMount hidden={aba !== 'servico'}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                name="categoria"
                label="Categoria"
                tipo="select"
                opcoes={OPCOES_CATEGORIA}
                className="sm:col-span-2"
              />
              <FormField
                name="descricaoServico"
                label="Descrição do Serviço"
                tipo="textarea"
                placeholder="Descreva os serviços prestados..."
                className="sm:col-span-2"
              />
              <FormField
                name="atendeUrgencia"
                label="Atende Urgência"
                tipo="switch"
                descricao="Disponível para chamados urgentes"
                className={CARTAO_SWITCH}
              />
              <FormField
                name="atendeFimSemana"
                label="Atende Fim de Semana"
                tipo="switch"
                descricao="Disponível aos sábados e domingos"
                className={CARTAO_SWITCH}
              />
            </div>
          </TabsContent>

          <TabsContent value="comercial" forceMount hidden={aba !== 'comercial'}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                name="formaPagamento"
                label="Forma de Pagamento"
                tipo="select"
                opcoes={OPCOES_FORMA_PAGAMENTO}
                className="sm:col-span-2"
              />
              {pix && (
                <FormField
                  name="chavePix"
                  label="Chave PIX"
                  placeholder="CPF, email, telefone ou chave aleatória"
                  className="sm:col-span-2"
                />
              )}
              <FormField name="valorHora" label="Valor/Hora (R$)" tipo="moeda" />
              <FormField name="valorDiaria" label="Valor/Diária (R$)" tipo="moeda" />
              <FormField
                name="emiteNotaFiscal"
                label="Emite Nota Fiscal"
                tipo="switch"
                descricao="O prestador emite NF ou NFS-e"
                className={CARTAO_SWITCH}
              />
            </div>
          </TabsContent>

          <TabsContent value="avaliacao" forceMount hidden={aba !== 'avaliacao'}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                name="notaQualidade"
                label="Qualidade do Serviço (1-5)"
                tipo="select"
                opcoes={OPCOES_NOTA}
              />
              <FormField
                name="notaPontualidade"
                label="Pontualidade (1-5)"
                tipo="select"
                opcoes={OPCOES_NOTA}
              />
              <FormField
                name="avaliacaoPreco"
                label="Avaliação de Preço"
                tipo="select"
                opcoes={OPCOES_AVALIACAO_PRECO}
                className="sm:col-span-2"
              />
              <FormField
                name="observacoes"
                label="Observações"
                tipo="textarea"
                placeholder="Observações sobre o prestador..."
                className="sm:col-span-2"
              />
            </div>
          </TabsContent>
        </Tabs>
      </FormLayout>
    </Modal>
  );
}
