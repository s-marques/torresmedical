import {
  ESTRELAS_MAX,
  ESTRELAS_MIN,
  NPS_NOTA_MAX,
  NPS_NOTA_MIN,
  PESQUISA_PROFISSIONAL_CATEGORIAS,
  respostaPesquisaProfissionalInputSchema,
  type PesquisaProfissionalCategoria,
} from '@torres/shared';
import { StarIcon } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { AuthLayout } from '@/app/pages/auth/AuthLayout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ApiRequestError, erroInesperadoApi } from '@/lib/api/api-error';
import { errosDoZod } from '@/lib/forms/erros-zod';
import { cn } from '@/lib/utils';
import { usePesquisaPublica, useResponderPesquisa } from './use-pesquisa-profissional';

const CAMPO_DA_CATEGORIA = {
  ESTRUTURA: 'notaEstrutura',
  RECEPCAO: 'notaRecepcao',
  AGENDA: 'notaAgenda',
  ATENDIMENTO: 'notaAtendimento',
} as const satisfies Record<PesquisaProfissionalCategoria, string>;

const ESTRELAS = Array.from(
  { length: ESTRELAS_MAX - ESTRELAS_MIN + 1 },
  (_, i) => ESTRELAS_MIN + i,
);
const NOTAS_NPS = Array.from(
  { length: NPS_NOTA_MAX - NPS_NOTA_MIN + 1 },
  (_, i) => NPS_NOTA_MIN + i,
);

type Valores = Partial<Record<string, number>>;

function Escala({
  nome,
  rotulo,
  opcoes,
  valor,
  erro,
  onChange,
  estrelas = false,
}: Readonly<{
  nome: string;
  rotulo: string;
  opcoes: readonly number[];
  valor: number | undefined;
  erro?: string;
  onChange: (valor: number) => void;
  estrelas?: boolean;
}>) {
  const id = useId();
  return (
    <div className="grid gap-1.5" data-testid={`escala-${nome}`}>
      <Label id={id}>{rotulo}</Label>
      <div
        role="radiogroup"
        aria-labelledby={id}
        aria-invalid={erro ? true : undefined}
        className="flex flex-wrap gap-1"
      >
        {opcoes.map((opcao) => {
          const marcado = valor === opcao;
          const preenchido = estrelas && valor !== undefined && opcao <= valor;
          return (
            <button
              key={opcao}
              type="button"
              role="radio"
              aria-checked={marcado}
              aria-label={`${rotulo}: ${opcao}`}
              onClick={() => onChange(opcao)}
              className={cn(
                'flex min-w-9 items-center justify-center rounded-md border px-2 py-1.5 text-sm transition-colors',
                estrelas
                  ? 'border-transparent'
                  : marcado && 'border-primary bg-primary text-primary-foreground',
              )}
            >
              {estrelas ? (
                <StarIcon
                  aria-hidden
                  className={cn(
                    'size-6',
                    preenchido ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground',
                  )}
                />
              ) : (
                opcao
              )}
            </button>
          );
        })}
      </div>
      {erro ? (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Página pública da pesquisa do profissional (`/pesquisa-profissional/responder?token=...`): o
 * profissional abre o link recebido pelo WhatsApp, sem login, e dá as estrelas de cada categoria,
 * a nota NPS e, se quiser, um comentário. Só a primeira resposta vale.
 */
export default function ResponderPesquisaPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const pesquisa = usePesquisaPublica(token);
  const responder = useResponderPesquisa(token);
  const [valores, setValores] = useState<Valores>({});
  const [comentario, setComentario] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviada, setEnviada] = useState(false);

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErroGeral(null);
    const dados = respostaPesquisaProfissionalInputSchema.safeParse({ ...valores, comentario });
    if (!dados.success) {
      setErros(errosDoZod(dados.error.issues));
      return;
    }
    setErros({});
    try {
      await responder.mutateAsync(dados.data);
      setEnviada(true);
    } catch (erro) {
      setErroGeral(erro instanceof ApiRequestError ? erro.message : erroInesperadoApi());
    }
  }

  const aviso = (descricao: string) => (
    <AuthLayout titulo={t('pesquisaProfissional.publica.titulo')} descricao="">
      <p role="status" className="text-center text-sm">
        {descricao}
      </p>
    </AuthLayout>
  );

  if (!token || pesquisa.isError) return aviso(t('pesquisaProfissional.publica.linkInvalido'));
  if (!pesquisa.data) return aviso(t('pesquisaProfissional.publica.carregando'));
  if (enviada) return aviso(t('pesquisaProfissional.publica.obrigado'));
  if (!pesquisa.data.aberta) {
    return aviso(
      t(
        pesquisa.data.motivo === 'EXPIRADA'
          ? 'pesquisaProfissional.publica.expirada'
          : 'pesquisaProfissional.publica.jaRespondida',
      ),
    );
  }

  return (
    <AuthLayout
      titulo={t('pesquisaProfissional.publica.titulo')}
      descricao={t('pesquisaProfissional.publica.saudacao', { nome: pesquisa.data.profissional })}
    >
      <form onSubmit={enviar} noValidate className="grid gap-4">
        {PESQUISA_PROFISSIONAL_CATEGORIAS.map((categoria) => {
          const campo = CAMPO_DA_CATEGORIA[categoria];
          return (
            <Escala
              key={categoria}
              nome={campo}
              rotulo={t(`pesquisaProfissional.categorias.${categoria}`)}
              opcoes={ESTRELAS}
              estrelas
              valor={valores[campo]}
              erro={erros[campo]}
              onChange={(v) => setValores((atual) => ({ ...atual, [campo]: v }))}
            />
          );
        })}
        <Escala
          nome="nps"
          rotulo={t('pesquisaProfissional.publica.nps')}
          opcoes={NOTAS_NPS}
          valor={valores.nps}
          erro={erros.nps}
          onChange={(v) => setValores((atual) => ({ ...atual, nps: v }))}
        />
        <div className="grid gap-1.5">
          <Label htmlFor="comentario-pesquisa">
            {t('pesquisaProfissional.publica.comentario')}
          </Label>
          <Textarea
            id="comentario-pesquisa"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            aria-invalid={erros.comentario ? true : undefined}
          />
          {erros.comentario ? (
            <p role="alert" className="text-sm text-destructive">
              {erros.comentario}
            </p>
          ) : null}
        </div>
        {erroGeral ? (
          <p role="alert" className="text-sm text-destructive">
            {erroGeral}
          </p>
        ) : null}
        <Button type="submit" disabled={responder.isPending}>
          {t('pesquisaProfissional.publica.enviar')}
        </Button>
      </form>
    </AuthLayout>
  );
}
