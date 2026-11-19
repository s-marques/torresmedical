import {
  EVOLUCAO_TIPO_ROTULOS,
  evolucaoVozInputSchema,
  type EvolucaoVozFormulario,
} from '@torres/shared';
import {
  ChevronDownIcon,
  ClockIcon,
  FileTextIcon,
  Loader2Icon,
  MicIcon,
  SaveIcon,
  SquareIcon,
  Trash2Icon,
  UserIcon,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { useFormState, useWatch } from 'react-hook-form';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissao } from '@/lib/auth/use-sessao';
import { formatarDataHora } from '@/lib/formatar';
import { cn } from '@/lib/utils';
import {
  useAgendamentoEvolucaoVoz,
  useHistoricoEvolucoes,
  useSalvarEvolucaoVoz,
} from './use-evolucao-voz';
import {
  formatarCronometro,
  juntarTrecho,
  MENSAGEM_SEM_SUPORTE,
  useCronometro,
  useReconhecimentoVoz,
} from './use-reconhecimento-voz';

const ID_FORMULARIO = 'form-evolucao-voz';
const VAZIO: EvolucaoVozFormulario = { texto: '' };

type Descarte = 'limpar' | 'trocar' | null;

export interface SessaoGravacaoProps {
  agendamentoId: string;
  onTrocarPaciente: () => void;
}

/**
 * Sessão do agendamento escolhido (print do dev no card #39): cabeçalho do paciente, gravação
 * com cronômetro e transcrição editável, "Limpar gravação", "Salvar Evolução" e "Histórico".
 */
export function SessaoGravacao({ agendamentoId, onTrocarPaciente }: Readonly<SessaoGravacaoProps>) {
  const podeSalvar = usePermissao('consultorio-assistencial.evolucao-voz.criar');
  const agendamento = useAgendamentoEvolucaoVoz(agendamentoId);
  const salvar = useSalvarEvolucaoVoz(agendamentoId);
  const form = useFormulario(evolucaoVozInputSchema, { defaultValues: VAZIO });
  const texto = useWatch({ control: form.control, name: 'texto' }) ?? '';
  const { isSubmitting } = useFormState({ control: form.control });
  const [descarte, setDescarte] = useState<Descarte>(null);

  const acrescentar = useCallback(
    (trecho: string) =>
      form.setValue('texto', juntarTrecho(form.getValues('texto') ?? '', trecho), {
        shouldDirty: true,
      }),
    [form],
  );
  const voz = useReconhecimentoVoz(acrescentar);
  const cronometro = useCronometro(voz.gravando);
  const temTexto = texto.trim().length > 0;

  const limpar = () => {
    voz.parar();
    form.reset(VAZIO);
    cronometro.zerar();
  };
  const trocar = () => {
    voz.parar();
    onTrocarPaciente();
  };
  const pedirDescarte = (acao: Exclude<Descarte, null>) => {
    if (temTexto) setDescarte(acao);
    else if (acao === 'limpar') limpar();
    else trocar();
  };

  const dados = agendamento.data;
  const subtitulo = dados
    ? `${dados.profissionalNome} — Agendamento #${dados.numero}`
    : 'Carregando agendamento...';

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr] lg:items-start">
      <div className="grid gap-6">
        <Card className="border-primary/30 bg-primary/5 py-4">
          <CardContent className="flex flex-wrap items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UserIcon aria-hidden className="size-5" />
            </span>
            <div className="grid min-w-0 flex-1">
              {agendamento.isError ? (
                <p role="alert" className="text-sm text-destructive">
                  Não foi possível carregar o agendamento.
                </p>
              ) : (
                <>
                  {dados ? (
                    <p className="truncate font-semibold">{dados.pacienteNome}</p>
                  ) : (
                    <Skeleton className="h-5 w-40" />
                  )}
                  <p className="truncate text-sm text-muted-foreground">{subtitulo}</p>
                </>
              )}
            </div>
            <Button type="button" variant="outline" onClick={() => pedirDescarte('trocar')}>
              Trocar paciente
            </Button>
          </CardContent>
        </Card>

        {podeSalvar ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MicIcon aria-hidden className="size-4" />
                  Gravação
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="flex flex-wrap items-center gap-4">
                  {voz.gravando ? (
                    <Button type="button" variant="destructive" size="lg" onClick={voz.parar}>
                      <SquareIcon aria-hidden />
                      Parar Gravação
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="lg"
                      onClick={voz.iniciar}
                      disabled={!voz.suportado || isSubmitting}
                    >
                      <MicIcon aria-hidden />
                      Iniciar Gravação
                    </Button>
                  )}
                  <span className="flex items-center gap-2 font-mono text-xl" aria-live="off">
                    <ClockIcon aria-hidden className="size-5 text-muted-foreground" />
                    <span aria-label="Tempo de gravação">
                      {formatarCronometro(cronometro.segundos)}
                    </span>
                  </span>
                  {voz.gravando && (
                    <span className="flex items-center gap-2 text-sm text-destructive">
                      <span aria-hidden className="size-2 animate-pulse rounded-full bg-current" />
                      Gravando
                    </span>
                  )}
                </div>
                {(!voz.suportado || voz.erro) && (
                  <Alert variant="destructive">
                    <AlertTitle className="line-clamp-none">
                      {voz.erro ?? MENSAGEM_SEM_SUPORTE}
                    </AlertTitle>
                  </Alert>
                )}
                <FormLayout
                  id={ID_FORMULARIO}
                  form={form}
                  acoes={null}
                  onSubmit={async (valores) => {
                    voz.parar();
                    await salvar.mutateAsync(valores);
                    form.reset(VAZIO);
                    cronometro.zerar();
                  }}
                >
                  <FormField
                    name="texto"
                    label="Transcrição"
                    tipo="textarea"
                    placeholder="Inicie a gravação para transcrever a consulta..."
                    className="[&_textarea]:min-h-60 [&_textarea]:font-mono"
                  />
                </FormLayout>
                {voz.parcial && (
                  <p aria-live="polite" className="text-sm text-muted-foreground italic">
                    {voz.parcial}…
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="outline" onClick={() => pedirDescarte('limpar')}>
                <Trash2Icon aria-hidden />
                Limpar gravação
              </Button>
              <Button type="submit" form={ID_FORMULARIO} disabled={!temTexto || isSubmitting}>
                {isSubmitting ? (
                  <Loader2Icon aria-hidden className="animate-spin" />
                ) : (
                  <SaveIcon aria-hidden />
                )}
                Salvar Evolução
              </Button>
            </div>
          </>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            Você não tem permissão para gravar evoluções.
          </p>
        )}
      </div>

      <PainelHistorico agendamentoId={agendamentoId} />

      <ConfirmDialog
        aberto={descarte !== null}
        onAbertoChange={(aberto) => aberto || setDescarte(null)}
        titulo="Descartar a transcrição?"
        descricao="O texto ainda não foi salvo e será perdido."
        rotuloConfirmar="Descartar"
        onConfirmar={() => {
          if (descarte === 'trocar') trocar();
          else limpar();
          setDescarte(null);
        }}
      />
    </div>
  );
}

/** "Histórico": todas as evoluções do paciente (confirmado pelo dev), recolhível. */
function PainelHistorico({ agendamentoId }: Readonly<{ agendamentoId: string }>) {
  const [aberto, setAberto] = useState(true);
  const { data, isPending, isError } = useHistoricoEvolucoes(agendamentoId);
  return (
    <Collapsible open={aberto} onOpenChange={setAberto} asChild>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileTextIcon aria-hidden className="size-4" />
            Histórico
          </CardTitle>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={aberto ? 'Recolher histórico' : 'Expandir histórico'}
            >
              <ChevronDownIcon
                aria-hidden
                className={cn('transition-transform', aberto && 'rotate-180')}
              />
            </Button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent asChild>
          <CardContent>
            {isPending && <Skeleton className="h-16 w-full" aria-label="Carregando" />}
            {isError && (
              <p role="alert" className="text-sm text-destructive">
                Não foi possível carregar o histórico.
              </p>
            )}
            {data && data.data.length === 0 && (
              <p role="status" className="py-4 text-center text-sm text-muted-foreground">
                Nenhuma evolução registrada para este paciente.
              </p>
            )}
            {data && data.data.length > 0 && (
              <ul className="grid gap-3" aria-label="Evoluções do paciente">
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
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
