import {
  ESTAGIO_COR_PADRAO,
  estagioInputSchema,
  MARCO_ESTAGIO_ROTULO,
  MARCOS_ESTAGIO,
  motivoPerdaInputSchema,
  type Estagio,
  type MarcoEstagio,
  type Permissao,
  type Pipeline,
} from '@torres/shared';
import { CheckIcon, PencilIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePermissao } from '@/lib/auth/use-sessao';
import {
  useCriarEstagio,
  useCriarMotivoPerda,
  useCriarOrigemNegocio,
  useCriarPipeline,
  useEditarEstagio,
  useEditarMotivoPerda,
  useEditarPipeline,
  useExcluirEstagio,
  useExcluirMotivoPerda,
  useExcluirOrigemNegocio,
  useExcluirPipeline,
  useMotivosPerda,
  useOrigensNegocio,
  useRenomearOrigemNegocio,
} from './use-pipeline';

const SEM_MARCO = 'nenhum';

/** Primeira mensagem do schema para o valor, ou `null` quando é válido. */
function erroDoNome(nome: string): string | null {
  return motivoPerdaInputSchema.safeParse({ nome }).error?.issues[0]?.message ?? null;
}

interface Permissoes {
  criar: Permissao;
  editar: Permissao;
  excluir: Permissao;
}

const PERMISSOES_PIPELINE: Permissoes = {
  criar: 'comercial-atendimento.pipeline.criar',
  editar: 'comercial-atendimento.pipeline.editar',
  excluir: 'comercial-atendimento.pipeline.excluir',
};

const PERMISSOES_ORIGENS: Permissoes = {
  criar: 'comercial-atendimento.origens-cliente.criar',
  editar: 'comercial-atendimento.origens-cliente.editar',
  excluir: 'comercial-atendimento.origens-cliente.excluir',
};

function Secao({ titulo, children }: Readonly<{ titulo: ReactNode; children: ReactNode }>) {
  return (
    <section className="grid gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function Etiqueta({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <span className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[11px]">
      {children}
    </span>
  );
}

/** Campo de nome com botão (criar/adicionar), validado pelo schema antes de enviar. */
function FormNome({
  placeholder,
  rotulo,
  onEnviar,
}: Readonly<{
  placeholder: string;
  rotulo: string;
  onEnviar: (nome: string) => Promise<unknown>;
}>) {
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const idErro = useId();

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    const mensagem = erroDoNome(nome);
    setErro(mensagem);
    if (mensagem) return;
    try {
      await onEnviar(nome.trim());
      setNome('');
    } catch {
      // O erro da API já aparece pelo tratamento global; o texto fica para corrigir.
    }
  }

  return (
    <form className="grid gap-1" onSubmit={enviar} noValidate>
      <div className="flex gap-2">
        <Input
          aria-label={placeholder}
          aria-invalid={Boolean(erro)}
          aria-describedby={erro ? idErro : undefined}
          placeholder={placeholder}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <Button type="submit">{rotulo}</Button>
      </div>
      {erro && (
        <p id={idErro} className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </form>
  );
}

interface ItemNome {
  id: string;
  nome: string;
  extra?: ReactNode;
}

/** Linha com nome, etiquetas e os botões Editar (renomear no lugar) e Excluir. */
function LinhaNome({
  item,
  permissoes,
  onRenomear,
  onExcluir,
}: Readonly<{
  item: ItemNome;
  permissoes: Permissoes;
  onRenomear: (nome: string) => Promise<unknown>;
  onExcluir: () => void;
}>) {
  const podeEditar = usePermissao(permissoes.editar);
  const podeExcluir = usePermissao(permissoes.excluir);
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(item.nome);
  const erro = editando ? erroDoNome(nome) : null;

  if (editando) {
    return (
      <form
        className="flex items-center gap-2 rounded-lg border p-2"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (erro) return;
          try {
            await onRenomear(nome.trim());
            setEditando(false);
          } catch {
            // Erro exibido pelo tratamento global da API.
          }
        }}
      >
        <Input
          aria-label={`Nome de ${item.nome}`}
          aria-invalid={Boolean(erro)}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          autoFocus
        />
        <Button
          type="submit"
          size="icon"
          variant="ghost"
          aria-label="Salvar"
          disabled={Boolean(erro)}
        >
          <CheckIcon />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Cancelar"
          onClick={() => {
            setNome(item.nome);
            setEditando(false);
          }}
        >
          <XIcon />
        </Button>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
      <span className="flex-1">{item.nome}</span>
      {item.extra}
      {podeEditar && (
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Editar ${item.nome}`}
          onClick={() => setEditando(true)}
        >
          <PencilIcon />
        </Button>
      )}
      {podeExcluir && (
        <Button
          size="icon"
          variant="ghost"
          className="text-destructive"
          aria-label={`Excluir ${item.nome}`}
          onClick={onExcluir}
        >
          <Trash2Icon />
        </Button>
      )}
    </div>
  );
}

const OPCOES_MARCO: { valor: string; rotulo: string }[] = [
  { valor: SEM_MARCO, rotulo: 'Marco: nenhum' },
  ...MARCOS_ESTAGIO.map((m) => ({ valor: m, rotulo: `Marco: ${MARCO_ESTAGIO_ROTULO[m]}` })),
];

interface ValoresEstagio {
  nome: string;
  cor: string;
  marco: string;
}

/** Nome, cor e marco do estágio (adicionar e editar). */
function FormEstagio({
  inicial,
  rotulo,
  onEnviar,
  onCancelar,
}: Readonly<{
  inicial: ValoresEstagio;
  rotulo: ReactNode;
  onEnviar: (valores: {
    nome: string;
    cor: string;
    marco: MarcoEstagio | null;
  }) => Promise<unknown>;
  onCancelar?: () => void;
}>) {
  const [valores, setValores] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const idMarco = useId();

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    const resultado = estagioInputSchema.safeParse({
      ...valores,
      marco: valores.marco === SEM_MARCO ? null : valores.marco,
    });
    setErro(resultado.error?.issues[0]?.message ?? null);
    if (!resultado.success) return;
    try {
      await onEnviar(resultado.data);
      if (!onCancelar) setValores({ ...inicial });
    } catch {
      // Erro exibido pelo tratamento global da API.
    }
  }

  return (
    <form className="grid gap-1" onSubmit={enviar} noValidate>
      <div className="flex flex-wrap gap-2">
        <Input
          className="min-w-40 flex-1"
          aria-label="Nome do estágio"
          aria-invalid={Boolean(erro)}
          placeholder="Nome"
          value={valores.nome}
          onChange={(e) => setValores({ ...valores, nome: e.target.value })}
        />
        <Input
          type="color"
          className="w-12 p-1"
          aria-label="Cor do estágio"
          value={valores.cor}
          onChange={(e) => setValores({ ...valores, cor: e.target.value })}
        />
        <select
          id={idMarco}
          aria-label="Marco do dashboard"
          className="h-9 rounded-md border bg-transparent px-2 text-sm"
          value={valores.marco}
          onChange={(e) => setValores({ ...valores, marco: e.target.value })}
        >
          {OPCOES_MARCO.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>
        <Button type="submit">{rotulo}</Button>
        {onCancelar && (
          <Button type="button" variant="ghost" onClick={onCancelar}>
            Cancelar
          </Button>
        )}
      </div>
      {erro && <p className="text-sm text-destructive">{erro}</p>}
    </form>
  );
}

function LinhaEstagio({
  estagio,
  onExcluir,
}: Readonly<{ estagio: Estagio; onExcluir: () => void }>) {
  const podeEditar = usePermissao('comercial-atendimento.pipeline.editar');
  const podeExcluir = usePermissao('comercial-atendimento.pipeline.excluir');
  const editar = useEditarEstagio();
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <div className="rounded-lg border p-2">
        <FormEstagio
          inicial={{ nome: estagio.nome, cor: estagio.cor, marco: estagio.marco ?? SEM_MARCO }}
          rotulo="Salvar"
          onCancelar={() => setEditando(false)}
          onEnviar={async (valores) => {
            await editar.mutateAsync({ id: estagio.id, ...valores });
            setEditando(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: estagio.cor }}
      />
      <span className="flex-1">{estagio.nome}</span>
      {estagio.marco && <Etiqueta>{MARCO_ESTAGIO_ROTULO[estagio.marco]}</Etiqueta>}
      <span className="rounded-md bg-muted px-1.5 text-xs font-medium" aria-label="Negócios">
        {estagio.quantidade}
      </span>
      {podeEditar && (
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Editar ${estagio.nome}`}
          onClick={() => setEditando(true)}
        >
          <PencilIcon />
        </Button>
      )}
      {podeExcluir && (
        <Button
          size="icon"
          variant="ghost"
          className="text-destructive"
          aria-label={`Excluir ${estagio.nome}`}
          onClick={onExcluir}
        >
          <Trash2Icon />
        </Button>
      )}
    </div>
  );
}

interface Exclusao {
  titulo: string;
  descricao: string;
  confirmar: () => Promise<unknown>;
}

export interface ModalConfiguracoesCrmProps {
  pipelines: readonly Pipeline[];
  /** Pipeline aberto no quadro: seus estágios aparecem em "Estágios — <nome>". */
  pipelineAtual: Pipeline | undefined;
  onFechar: () => void;
}

/** Modal "Configurações do CRM": pipelines, estágios, origens do negócio e motivos de perda. */
export function ModalConfiguracoesCrm({
  pipelines,
  pipelineAtual,
  onFechar,
}: Readonly<ModalConfiguracoesCrmProps>) {
  const podeCriar = usePermissao('comercial-atendimento.pipeline.criar');
  const podeCriarOrigem = usePermissao('comercial-atendimento.origens-cliente.criar');
  const podeVerOrigens = usePermissao('comercial-atendimento.origens-cliente.ver');
  const motivos = useMotivosPerda();
  const origens = useOrigensNegocio();
  const criarPipeline = useCriarPipeline();
  const editarPipeline = useEditarPipeline();
  const excluirPipeline = useExcluirPipeline();
  const criarEstagio = useCriarEstagio(pipelineAtual?.id ?? '');
  const excluirEstagio = useExcluirEstagio();
  const criarOrigem = useCriarOrigemNegocio();
  const renomearOrigem = useRenomearOrigemNegocio();
  const excluirOrigem = useExcluirOrigemNegocio();
  const criarMotivo = useCriarMotivoPerda();
  const editarMotivo = useEditarMotivoPerda();
  const excluirMotivo = useExcluirMotivoPerda();
  const [exclusao, setExclusao] = useState<Exclusao | null>(null);

  const pedirExclusao = (tipo: string, nome: string, confirmar: () => Promise<unknown>) =>
    setExclusao({
      titulo: `Excluir ${tipo}?`,
      descricao: `"${nome}" será excluído. Esta ação não pode ser desfeita.`,
      confirmar,
    });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Configurações do CRM"
      tamanho="lg"
      rodape={
        <Button variant="outline" onClick={onFechar}>
          Fechar
        </Button>
      }
    >
      <div className="grid gap-6 pb-2">
        <Secao titulo="Pipelines">
          {pipelines.map((p) => (
            <LinhaNome
              key={p.id}
              item={p}
              permissoes={PERMISSOES_PIPELINE}
              onRenomear={(nome) => editarPipeline.mutateAsync({ id: p.id, nome })}
              onExcluir={() =>
                pedirExclusao('pipeline', p.nome, () => excluirPipeline.mutateAsync(p.id))
              }
            />
          ))}
          {podeCriar && (
            <FormNome
              placeholder="Nome do novo pipeline"
              rotulo="Criar"
              onEnviar={(nome) => criarPipeline.mutateAsync({ nome })}
            />
          )}
        </Secao>

        {pipelineAtual && (
          <Secao titulo={`Estágios — ${pipelineAtual.nome}`}>
            {pipelineAtual.estagios.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum estágio.</p>
            )}
            {pipelineAtual.estagios.map((e) => (
              <LinhaEstagio
                key={e.id}
                estagio={e}
                onExcluir={() =>
                  pedirExclusao('estágio', e.nome, () => excluirEstagio.mutateAsync(e.id))
                }
              />
            ))}
            {podeCriar && (
              <>
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  Adicionar estágio{' '}
                  <span className="font-normal normal-case">
                    (Marco do dashboard: data gravada quando o negócio entra no estágio)
                  </span>
                </p>
                <FormEstagio
                  inicial={{ nome: '', cor: ESTAGIO_COR_PADRAO, marco: SEM_MARCO }}
                  rotulo="Adicionar"
                  onEnviar={(valores) => criarEstagio.mutateAsync(valores)}
                />
              </>
            )}
          </Secao>
        )}

        {podeVerOrigens && (
          <Secao titulo="Origens do negócio">
            {(origens.data?.data ?? []).map((o) => (
              <LinhaNome
                key={o.id}
                item={{ id: o.id, nome: o.nome, extra: <Etiqueta>{o.codigo}</Etiqueta> }}
                permissoes={PERMISSOES_ORIGENS}
                onRenomear={(nome) => renomearOrigem.mutateAsync({ id: o.id, nome })}
                onExcluir={() =>
                  pedirExclusao('origem', o.nome, () => excluirOrigem.mutateAsync(o.id))
                }
              />
            ))}
            {podeCriarOrigem && (
              <FormNome
                placeholder="Nome da origem"
                rotulo="Adicionar"
                onEnviar={(nome) => criarOrigem.mutateAsync({ nome })}
              />
            )}
          </Secao>
        )}

        <Secao titulo="Motivos de perda">
          {(motivos.data ?? []).map((m) => (
            <LinhaNome
              key={m.id}
              item={{ id: m.id, nome: m.nome, extra: <Etiqueta>{m.codigo}</Etiqueta> }}
              permissoes={PERMISSOES_PIPELINE}
              onRenomear={(nome) => editarMotivo.mutateAsync({ id: m.id, nome })}
              onExcluir={() =>
                pedirExclusao('motivo', m.nome, () => excluirMotivo.mutateAsync(m.id))
              }
            />
          ))}
          {podeCriar && (
            <FormNome
              placeholder="Nome do motivo"
              rotulo="Adicionar"
              onEnviar={(nome) => criarMotivo.mutateAsync({ nome })}
            />
          )}
        </Secao>
      </div>

      <ConfirmDialog
        aberto={exclusao !== null}
        onAbertoChange={(aberto) => aberto || setExclusao(null)}
        titulo={exclusao?.titulo ?? ''}
        descricao={exclusao?.descricao}
        rotuloConfirmar="Excluir"
        destrutivo
        onConfirmar={async () => {
          await exclusao?.confirmar();
          setExclusao(null);
        }}
      />
    </Modal>
  );
}
