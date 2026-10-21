import { ESPECIALIDADE_NOME_MAX, type Especialidade } from '@torres/shared';
import { CheckIcon, PencilIcon, PlusIcon, StethoscopeIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Modal } from '@/components/shared/Modal';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiRequestError } from '@/lib/api/api-error';
import {
  useAdicionarEspecialidade,
  useEspecialidades,
  useExcluirEspecialidade,
  useRenomearEspecialidade,
} from './use-profissionais';

function mensagemDe(error: unknown): string {
  return error instanceof ApiRequestError ? error.message : 'Não foi possível concluir a ação.';
}

/** Modal "Gerenciar Especialidades": adicionar, renomear e excluir. */
export function ModalEspecialidades({ onFechar }: Readonly<{ onFechar: () => void }>) {
  const lista = useEspecialidades();
  const adicionar = useAdicionarEspecialidade();
  const renomear = useRenomearEspecialidade();
  const excluir = useExcluirEspecialidade();
  const [novo, setNovo] = useState('');
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null);
  const [excluindo, setExcluindo] = useState<Especialidade | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function enviarNovo(evento: FormEvent) {
    evento.preventDefault();
    if (!novo.trim()) {
      setErro('Informe o nome da especialidade');
      return;
    }
    setErro(null);
    try {
      await adicionar.mutateAsync({ nome: novo });
      setNovo('');
    } catch (error) {
      setErro(mensagemDe(error));
    }
  }

  async function salvarEdicao(evento: FormEvent) {
    evento.preventDefault();
    if (!editando) return;
    if (!editando.nome.trim()) {
      setErro('Informe o nome da especialidade');
      return;
    }
    setErro(null);
    try {
      await renomear.mutateAsync(editando);
      setEditando(null);
    } catch (error) {
      setErro(mensagemDe(error));
    }
  }

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Gerenciar Especialidades"
    >
      <div className="grid gap-4">
        <SePermitido permissao="gestao-profissionais.profissionais.editar">
          <form className="flex gap-2" onSubmit={(evento) => void enviarNovo(evento)}>
            <Input
              aria-label="Nova especialidade"
              placeholder="Nova especialidade..."
              maxLength={ESPECIALIDADE_NOME_MAX}
              value={novo}
              onChange={(evento) => setNovo(evento.target.value)}
            />
            <Button type="submit" disabled={adicionar.isPending}>
              <PlusIcon aria-hidden />
              Adicionar
            </Button>
          </form>
        </SePermitido>
        {erro && (
          <p className="text-sm text-destructive" role="alert">
            {erro}
          </p>
        )}
        {lista.isPending && <Skeleton className="h-24" aria-busy />}
        {lista.isError && (
          <p className="text-sm text-destructive" role="alert">
            Não foi possível carregar as especialidades.
          </p>
        )}
        {lista.data && lista.data.data.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nenhuma especialidade cadastrada.
          </p>
        )}
        {lista.data && lista.data.data.length > 0 && (
          <ul className="grid gap-2">
            {lista.data.data.map((especialidade) => (
              <li
                key={especialidade.id}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                {editando?.id === especialidade.id ? (
                  <form
                    className="flex flex-1 gap-2"
                    onSubmit={(evento) => void salvarEdicao(evento)}
                  >
                    <Input
                      aria-label={`Nome de ${especialidade.nome}`}
                      maxLength={ESPECIALIDADE_NOME_MAX}
                      value={editando.nome}
                      onChange={(evento) => setEditando({ ...editando, nome: evento.target.value })}
                    />
                    <Button type="submit" size="icon-sm" aria-label="Salvar nome">
                      <CheckIcon aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label="Cancelar edição"
                      onClick={() => setEditando(null)}
                    >
                      <XIcon aria-hidden />
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className="flex min-w-0 items-center gap-2 text-sm">
                      <StethoscopeIcon
                        aria-hidden
                        className="size-4 shrink-0 text-muted-foreground"
                      />
                      {especialidade.nome}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <SePermitido permissao="gestao-profissionais.profissionais.editar">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Editar ${especialidade.nome}`}
                          onClick={() => {
                            setErro(null);
                            setEditando({ id: especialidade.id, nome: especialidade.nome });
                          }}
                        >
                          <PencilIcon aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          aria-label={`Excluir ${especialidade.nome}`}
                          onClick={() => {
                            setErro(null);
                            setExcluindo(especialidade);
                          }}
                        >
                          <Trash2Icon aria-hidden />
                        </Button>
                      </SePermitido>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir especialidade"
        descricao={`Excluir a especialidade "${excluindo?.nome ?? ''}"? Não é possível excluir uma especialidade em uso por profissionais.`}
        rotuloConfirmar="Excluir"
        onConfirmar={async () => {
          if (!excluindo) return;
          try {
            await excluir.mutateAsync(excluindo.id);
          } catch (error) {
            setErro(mensagemDe(error));
            throw error;
          }
        }}
      />
    </Modal>
  );
}
