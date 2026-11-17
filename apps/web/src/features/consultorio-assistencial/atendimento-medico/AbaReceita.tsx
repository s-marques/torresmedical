import {
  EVOLUCAO_TIPO_ROTULOS,
  EVOLUCAO_TIPOS,
  RECEITA_VALIDADE_ROTULOS,
  RECEITA_VALIDADES,
  receitaInputSchema,
  textoDoProtocolo,
  type AtendimentoEmCurso,
  type CreateReceitaInput,
  type ProtocoloReceita,
  type ReceitaFormulario,
} from '@torres/shared';
import { BookOpenIcon, HistoryIcon, Link2Icon, PlayIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { EmptyState } from '@/components/shared/EmptyState';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebounce } from '@/hooks/use-debounce';
import { usePermissao } from '@/lib/auth/use-sessao';
import { formatarDataHora } from '@/lib/formatar';
import {
  useCategoriasProtocolos,
  useProtocolosReceita,
  useReceitas,
  useSalvarReceita,
} from './use-atendimento-medico';

const ID_FORMULARIO = 'form-receita';
const ATRASO_BUSCA_MS = 300;
const TODAS = 'todas';

const OPCOES_TIPO = EVOLUCAO_TIPOS.map((tipo) => ({
  valor: tipo,
  rotulo: EVOLUCAO_TIPO_ROTULOS[tipo],
}));

const OPCOES_VALIDADE = RECEITA_VALIDADES.map((dias) => ({
  valor: String(dias),
  rotulo: RECEITA_VALIDADE_ROTULOS[dias],
}));

const VALORES_INICIAIS: ReceitaFormulario = {
  tipo: 'EVOLUCAO',
  controlada: false,
  validadeDias: '30',
  texto: '',
  observacoes: '',
};

export interface AbaReceitaProps {
  agendamentoId: string;
  atendimento: AtendimentoEmCurso | null;
}

/** Aba "Receita": Memed (fora desta entrega), receita manual e receitas anteriores do paciente. */
export function AbaReceita({ agendamentoId, atendimento }: Readonly<AbaReceitaProps>) {
  const podeSalvar = usePermissao('consultorio-assistencial.atendimento-medico.criar');

  return (
    <div className="grid gap-4">
      <ReceitaMemed />
      {atendimento ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {podeSalvar && atendimento.status === 'EM_ANDAMENTO' && (
            <NovaReceita agendamentoId={agendamentoId} />
          )}
          <ReceitasAnteriores agendamentoId={agendamentoId} />
        </div>
      ) : (
        <EmptyState
          icone={PlayIcon}
          titulo="Inicie o atendimento primeiro"
          descricao='Clique em "Iniciar Atendimento" para registrar receitas.'
        />
      )}
    </div>
  );
}

/** A integração com a Memed fica para uma issue própria: o botão aparece desabilitado. */
function ReceitaMemed() {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
        <span className="flex items-center gap-2 font-medium text-blue-700 dark:text-blue-400">
          <Link2Icon aria-hidden className="size-4" />
          Receita Digital (Memed)
        </span>
        <Button
          type="button"
          variant="outline"
          disabled
          title="A integração com a Memed ainda não está disponível."
        >
          <Link2Icon aria-hidden />
          Abrir Receita Memed
        </Button>
      </CardContent>
    </Card>
  );
}

function NovaReceita({ agendamentoId }: Readonly<{ agendamentoId: string }>) {
  const salvar = useSalvarReceita(agendamentoId);
  const [protocolosAbertos, setProtocolosAbertos] = useState(false);
  const [anterioresAbertas, setAnterioresAbertas] = useState(false);
  const form = useFormulario(receitaInputSchema, { defaultValues: VALORES_INICIAIS });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2Icon aria-hidden className="size-4" />
          Nova Receita Manual
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={protocolosAbertos}
            onClick={() => setProtocolosAbertos((aberto) => !aberto)}
          >
            <BookOpenIcon aria-hidden />
            Protocolos
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAnterioresAbertas(true)}
          >
            <HistoryIcon aria-hidden />
            Anteriores / Orçamento
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {protocolosAbertos && (
          <SeletorProtocolos
            onFechar={() => setProtocolosAbertos(false)}
            onEscolher={(protocolo) => {
              inserirProtocolo(form, protocolo);
              setProtocolosAbertos(false);
            }}
          />
        )}
        <FormLayout
          id={ID_FORMULARIO}
          form={form}
          acoes={<FormAcoes form={form} formId={ID_FORMULARIO} rotuloEnviar="Salvar Receita" />}
          onSubmit={async (valores) => {
            await salvar.mutateAsync(valores);
            form.reset(VALORES_INICIAIS);
          }}
        >
          <FormField name="tipo" label="Tipo" tipo="select" opcoes={OPCOES_TIPO} />
          <FormField name="controlada" label="Receita Amarela (Controlada)" tipo="checkbox" />
          <FormField name="validadeDias" label="Validade" tipo="select" opcoes={OPCOES_VALIDADE} />
          <FormField
            name="texto"
            label="Receita"
            tipo="textarea"
            placeholder={'1) Medicamento - Dosagem - Posologia\n2) ...'}
            obrigatorio
          />
          <FormField
            name="observacoes"
            label="Observações"
            tipo="textarea"
            placeholder="Observações..."
          />
        </FormLayout>
      </CardContent>
      {anterioresAbertas && (
        <Modal
          aberto
          onAbertoChange={(aberto) => aberto || setAnterioresAbertas(false)}
          titulo="Anteriores / Orçamento"
        >
          <EmptyState titulo="Nenhuma receita anterior ou orçamento para importar." />
        </Modal>
      )}
    </Card>
  );
}

/** Acrescenta o nome e as observações do protocolo ao texto da receita (confirmado pelo dev). */
function inserirProtocolo(
  form: UseFormReturn<ReceitaFormulario, unknown, CreateReceitaInput>,
  protocolo: Pick<ProtocoloReceita, 'nome' | 'texto'>,
) {
  const atual = (form.getValues('texto') ?? '').trimEnd();
  const novo = textoDoProtocolo(protocolo);
  form.setValue('texto', atual ? `${atual}\n${novo}` : novo, {
    shouldDirty: true,
    shouldValidate: form.formState.submitCount > 0,
  });
}

interface SeletorProtocolosProps {
  onFechar: () => void;
  onEscolher: (protocolo: ProtocoloReceita) => void;
}

/** "Selecionar Protocolo/Receita": filtro por categoria, busca e lista do cadastro. */
function SeletorProtocolos({ onFechar, onEscolher }: Readonly<SeletorProtocolosProps>) {
  const [categoria, setCategoria] = useState(TODAS);
  const [busca, setBusca] = useState('');
  const categorias = useCategoriasProtocolos();
  const protocolos = useProtocolosReceita(
    useDebounce(busca.trim(), ATRASO_BUSCA_MS),
    categoria === TODAS ? undefined : categoria,
  );
  const itens = protocolos.data?.data ?? [];

  return (
    <section
      aria-labelledby="titulo-protocolos"
      className="grid gap-2 rounded-md border border-primary/40 p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id="titulo-protocolos" className="text-sm font-semibold">
          Selecionar Protocolo/Receita
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Fechar protocolos"
          onClick={onFechar}
        >
          <XIcon aria-hidden />
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Select value={categoria} onValueChange={setCategoria}>
          <SelectTrigger aria-label="Categoria do protocolo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas</SelectItem>
            {(categorias.data?.data ?? []).map((nome) => (
              <SelectItem key={nome} value={nome}>
                {nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="search"
          aria-label="Buscar protocolo"
          placeholder="Buscar..."
          value={busca}
          onChange={(evento) => setBusca(evento.target.value)}
        />
      </div>
      {protocolos.isPending && <Skeleton className="h-16 w-full" aria-label="Carregando" />}
      {protocolos.isError && (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar os protocolos.
        </p>
      )}
      {protocolos.data && itens.length === 0 && (
        <p role="status" className="py-3 text-center text-sm text-muted-foreground">
          Nenhum protocolo encontrado
        </p>
      )}
      {itens.length > 0 && (
        <ul className="grid max-h-64 gap-2 overflow-y-auto" aria-label="Protocolos">
          {itens.map((protocolo) => (
            <li key={protocolo.id}>
              <button
                type="button"
                className="grid w-full gap-1 rounded-md border p-2 text-left hover:bg-muted"
                onClick={() => onEscolher(protocolo)}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{protocolo.nome}</span>
                  <span className="text-xs text-muted-foreground">{protocolo.categoria}</span>
                </span>
                {protocolo.texto && (
                  <span className="line-clamp-1 text-xs text-muted-foreground">
                    {protocolo.texto}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReceitasAnteriores({ agendamentoId }: Readonly<{ agendamentoId: string }>) {
  const { data, isPending, isError } = useReceitas(agendamentoId);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HistoryIcon aria-hidden className="size-4" />
          Receitas Anteriores
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isPending && <Skeleton className="h-16 w-full" aria-label="Carregando" />}
        {isError && (
          <p role="alert" className="text-sm text-destructive">
            Não foi possível carregar as receitas.
          </p>
        )}
        {data && data.data.length === 0 && (
          <p role="status" className="py-4 text-center text-sm text-muted-foreground">
            Nenhuma receita anterior
          </p>
        )}
        {data && data.data.length > 0 && (
          <ul className="grid gap-3" aria-label="Receitas">
            {data.data.map((receita) => (
              <li key={receita.id} className="grid gap-1 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">{EVOLUCAO_TIPO_ROTULOS[receita.tipo]}</Badge>
                  {receita.controlada && (
                    <Badge className="bg-yellow-200 text-yellow-900 hover:bg-yellow-200">
                      Controlada
                    </Badge>
                  )}
                  <span>{formatarDataHora(receita.createdAt)}</span>
                  <span>
                    Validade:{' '}
                    {RECEITA_VALIDADE_ROTULOS[
                      receita.validadeDias as keyof typeof RECEITA_VALIDADE_ROTULOS
                    ] ?? `${receita.validadeDias} dias`}
                  </span>
                  {receita.profissionalNome && <span>{receita.profissionalNome}</span>}
                </div>
                <p className="text-sm whitespace-pre-wrap">{receita.texto}</p>
                {receita.observacoes && (
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                    {receita.observacoes}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
