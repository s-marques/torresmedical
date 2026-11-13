import { type Pacote } from '@torres/shared';
import { CircleCheckIcon, PencilIcon, XIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Modal } from '@/components/shared/Modal';
import { SePermitido } from '@/components/shared/SePermitido';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatarData, formatarDataHora } from '@/lib/formatar';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { ModalRegistrarUso } from './ModalRegistrarUso';
import { BarraSessoes, StatusPacote } from './StatusPacote';
import { usePacote, useRemoverUso } from './use-pacotes';

function Item({ rotulo, children }: Readonly<{ rotulo: string; children: ReactNode }>) {
  return (
    <div className="grid gap-1">
      <dt className="text-sm text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm font-medium break-words">{children || '-'}</dd>
    </div>
  );
}

export interface DetalhePacoteProps {
  /** Linha do grid; o detalhe se atualiza sozinho depois de cada uso de sessão. */
  pacote: Pacote;
  onFechar: () => void;
  onEditar: (pacote: Pacote) => void;
}

/** Modal de detalhe (clique na linha ou "Visualizar" no menu de ações). */
export function DetalhePacote({
  pacote: inicial,
  onFechar,
  onEditar,
}: Readonly<DetalhePacoteProps>) {
  const { data: pacote } = usePacote(inicial);
  const removerUso = useRemoverUso(pacote.id);
  const [usando, setUsando] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const percentual =
    pacote.sessoesTotal > 0 ? Math.round((pacote.sessoesUsadas / pacote.sessoesTotal) * 100) : 0;
  const podeUsar = pacote.status !== 'CANCELADO' && pacote.saldo > 0;

  return (
    <>
      <Modal
        aberto
        onAbertoChange={(aberto) => aberto || onFechar()}
        titulo={pacote.nome}
        tamanho="lg"
        rodape={
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={onFechar}>
              Fechar
            </Button>
            <SePermitido permissao="comercial-atendimento.pacotes.editar">
              <Button type="button" onClick={() => onEditar(pacote)}>
                <PencilIcon aria-hidden />
                Editar
              </Button>
            </SePermitido>
          </div>
        }
      >
        <div className="grid gap-5">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Item rotulo="Cliente">{pacote.cliente}</Item>
            <Item rotulo="Status">
              <StatusPacote status={pacote.status} />
            </Item>
            <div className="sm:col-span-2">
              <Item rotulo="Descrição">{pacote.descricao}</Item>
            </div>
            <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3">
              <Item rotulo="Valor Total">{formatarMoeda(Number(pacote.valorTotal))}</Item>
              <Item rotulo="Início">{pacote.dataInicio && formatarData(pacote.dataInicio)}</Item>
              <Item rotulo="Vencimento">
                {pacote.dataVencimento && formatarData(pacote.dataVencimento)}
              </Item>
            </div>
            <div className="sm:col-span-2">
              <Item rotulo="Profissional">{pacote.profissional}</Item>
            </div>
            <div className="sm:col-span-2">
              <Item rotulo="Observações">{pacote.observacoes}</Item>
            </div>
          </dl>

          <section aria-labelledby="titulo-progresso" className="grid gap-2 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 id="titulo-progresso" className="text-sm font-semibold">
                Progresso de Uso
              </h3>
              <span className="text-sm text-muted-foreground">
                {pacote.sessoesUsadas} / {pacote.sessoesTotal} sessões
              </span>
            </div>
            <BarraSessoes
              usadas={pacote.sessoesUsadas}
              total={pacote.sessoesTotal}
              rotulo="Progresso de uso do pacote"
              className="h-2.5 w-full"
            />
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{percentual}% utilizado</span>
              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                Saldo: {pacote.saldo} sessão(ões)
              </span>
            </div>
          </section>

          <section aria-labelledby="titulo-itens" className="grid gap-2">
            <h3 id="titulo-itens" className="text-sm font-semibold">
              Itens do Pacote
            </h3>
            {pacote.itens.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm"
              >
                <span className="font-medium">{item.descricao}</span>
                <span className="text-xs text-muted-foreground">
                  {formatarMoeda(Number(item.valorUnitario))}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {item.usadas}/{item.quantidade}
                </span>
                <BarraSessoes
                  usadas={item.usadas}
                  total={item.quantidade}
                  rotulo={`Uso de ${item.descricao}`}
                  className="h-1.5 w-24"
                />
                <Badge variant="outline">{item.quantidade - item.usadas} restante(s)</Badge>
              </div>
            ))}
          </section>

          <section aria-labelledby="titulo-historico" className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <h3 id="titulo-historico" className="text-sm font-semibold">
                Histórico de Utilizações
              </h3>
              <SePermitido permissao="comercial-atendimento.pacotes.editar">
                <Button
                  type="button"
                  size="sm"
                  disabled={!podeUsar}
                  onClick={() => setUsando(true)}
                >
                  <CircleCheckIcon aria-hidden />
                  Usar Sessão
                </Button>
              </SePermitido>
            </div>
            {pacote.usos.length === 0 && (
              <p className="py-3 text-center text-sm text-muted-foreground">
                Nenhuma utilização registrada.
              </p>
            )}
            {pacote.usos.map((uso) => (
              <div
                key={uso.id}
                className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm"
              >
                <CircleCheckIcon aria-hidden className="size-4 shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {formatarDataHora(uso.data)}
                    {uso.quantidade > 1 && ` · ${uso.quantidade} sessões`}
                  </p>
                  <p className="text-xs text-muted-foreground">{uso.profissional}</p>
                  {uso.observacoes && (
                    <p className="text-xs text-muted-foreground">{uso.observacoes}</p>
                  )}
                </div>
                <SePermitido permissao="comercial-atendimento.pacotes.editar">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive"
                    aria-label="Remover uso de sessão"
                    onClick={() => setRemovendo(uso.id)}
                  >
                    <XIcon aria-hidden />
                  </Button>
                </SePermitido>
              </div>
            ))}
          </section>
        </div>
      </Modal>
      {usando && <ModalRegistrarUso pacote={pacote} onFechar={() => setUsando(false)} />}
      <ConfirmDialog
        aberto={removendo !== null}
        onAbertoChange={(aberto) => aberto || setRemovendo(null)}
        titulo="Remover uso de sessão"
        descricao="Tem certeza que deseja remover este uso? A sessão volta para o saldo do pacote."
        rotuloConfirmar="Remover"
        onConfirmar={() => (removendo ? removerUso.mutateAsync(removendo) : undefined)}
      />
    </>
  );
}
