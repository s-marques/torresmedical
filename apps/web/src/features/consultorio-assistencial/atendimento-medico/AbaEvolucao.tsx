import {
  EVOLUCAO_TIPO_ROTULOS,
  EVOLUCAO_TIPOS,
  evolucaoInputSchema,
  type AtendimentoEmCurso,
  type EvolucaoFormulario,
} from '@torres/shared';
import { ClipboardListIcon, HistoryIcon, PlayIcon, PlusIcon, SearchIcon } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { useWatch } from 'react-hook-form';
import { EmptyState } from '@/components/shared/EmptyState';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissao } from '@/lib/auth/use-sessao';
import { formatarDataHora } from '@/lib/formatar';
import { useEvolucoes, useSalvarEvolucao } from './use-atendimento-medico';

const ID_FORMULARIO = 'form-evolucao';

const OPCOES_TIPO = EVOLUCAO_TIPOS.map((tipo) => ({
  valor: tipo,
  rotulo: EVOLUCAO_TIPO_ROTULOS[tipo],
}));

type ModeloAberto = 'receitas' | 'exames' | null;

export interface AbaEvolucaoProps {
  agendamentoId: string;
  atendimento: AtendimentoEmCurso | null;
}

/** Aba "Evolução": nova evolução (com o atendimento em andamento) e o histórico do paciente. */
export function AbaEvolucao({ agendamentoId, atendimento }: Readonly<AbaEvolucaoProps>) {
  const podeSalvar = usePermissao('consultorio-assistencial.atendimento-medico.criar');

  if (!atendimento) {
    return (
      <EmptyState
        icone={PlayIcon}
        titulo="Inicie o atendimento primeiro"
        descricao='Clique em "Iniciar Atendimento" para registrar evoluções.'
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      {podeSalvar && atendimento.status === 'EM_ANDAMENTO' && (
        <NovaEvolucao agendamentoId={agendamentoId} />
      )}
      <HistoricoEvolucoes agendamentoId={agendamentoId} />
    </div>
  );
}

function NovaEvolucao({ agendamentoId }: Readonly<{ agendamentoId: string }>) {
  const salvar = useSalvarEvolucao(agendamentoId);
  const [modelo, setModelo] = useState<ModeloAberto>(null);
  const valoresIniciais: EvolucaoFormulario = { tipo: 'EVOLUCAO', texto: '' };
  const form = useFormulario(evolucaoInputSchema, { defaultValues: valoresIniciais });
  const texto = useWatch({ control: form.control, name: 'texto' }) ?? '';

  // Ctrl+Enter (ou Cmd+Enter) salva, como indica o cabeçalho do cartão.
  const salvarComAtalho = (evento: KeyboardEvent<HTMLDivElement>) => {
    if (evento.key === 'Enter' && (evento.ctrlKey || evento.metaKey)) {
      evento.preventDefault();
      document.querySelector<HTMLFormElement>(`#${ID_FORMULARIO}`)?.requestSubmit();
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <PlusIcon aria-hidden className="size-4" />
          Nova Evolução
        </CardTitle>
        <span className="text-xs text-muted-foreground">Ctrl+Enter para salvar</span>
      </CardHeader>
      <CardContent className="grid gap-3" onKeyDown={salvarComAtalho}>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setModelo('receitas')}>
            <ClipboardListIcon aria-hidden />
            Receitas
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setModelo('exames')}>
            <SearchIcon aria-hidden />
            Solic. Exames
          </Button>
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {texto.length} caracteres
          </span>
        </div>
        <FormLayout
          id={ID_FORMULARIO}
          form={form}
          acoes={<FormAcoes form={form} formId={ID_FORMULARIO} rotuloEnviar="Salvar Evolução" />}
          onSubmit={async (valores) => {
            await salvar.mutateAsync(valores);
            form.reset(valoresIniciais);
          }}
        >
          <FormField name="tipo" label="Tipo" tipo="select" opcoes={OPCOES_TIPO} />
          <FormField
            name="texto"
            label="Evolução"
            tipo="textarea"
            placeholder="Descreva a evolução do paciente..."
            obrigatorio
          />
        </FormLayout>
      </CardContent>
      {modelo && <ModalModelos modelo={modelo} onFechar={() => setModelo(null)} />}
    </Card>
  );
}

/**
 * "Receitas" e "Solic. Exames": modelos para preencher a evolução. Ainda não há modelos
 * cadastrados (confirmado pelo dev), por isso a lista aparece vazia.
 */
function ModalModelos({
  modelo,
  onFechar,
}: Readonly<{ modelo: Exclude<ModeloAberto, null>; onFechar: () => void }>) {
  const receitas = modelo === 'receitas';
  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={receitas ? 'Receitas' : 'Solicitação de Exames'}
    >
      <EmptyState
        titulo={
          receitas ? 'Nenhuma receita cadastrada.' : 'Nenhuma solicitação de exame cadastrada.'
        }
      />
    </Modal>
  );
}

function HistoricoEvolucoes({ agendamentoId }: Readonly<{ agendamentoId: string }>) {
  const { data, isPending, isError } = useEvolucoes(agendamentoId);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HistoryIcon aria-hidden className="size-4" />
          Histórico de Evoluções
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isPending && <Skeleton className="h-16 w-full" aria-label="Carregando" />}
        {isError && (
          <p role="alert" className="text-sm text-destructive">
            Não foi possível carregar as evoluções.
          </p>
        )}
        {data && data.data.length === 0 && (
          <p role="status" className="py-4 text-center text-sm text-muted-foreground">
            Nenhuma evolução registrada
          </p>
        )}
        {data && data.data.length > 0 && (
          <ul className="grid gap-3" aria-label="Evoluções">
            {data.data.map((evolucao) => (
              <li key={evolucao.id} className="grid gap-1 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="secondary">{EVOLUCAO_TIPO_ROTULOS[evolucao.tipo]}</Badge>
                  <span>{formatarDataHora(evolucao.createdAt)}</span>
                  {evolucao.profissionalNome && <span>{evolucao.profissionalNome}</span>}
                </div>
                <p className="text-sm whitespace-pre-wrap">{evolucao.texto}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
