import { CAMPANHA_TIPO_ENVIO_ROTULO, type MensagemAutomatica } from '@torres/shared';
import { ClockIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { SePermitido } from '@/components/shared/SePermitido';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { usePermissao } from '@/lib/auth/use-sessao';
import { ModalMensagemAutomatica } from './ModalMensagemAutomatica';
import { descreverDias, descreverFiltro } from './textos';
import { useAtivarAutomacao, useExcluirAutomacao, useMensagensAutomaticas } from './use-campanhas';

function CartaoAutomacao({
  automacao,
  onEditar,
  onExcluir,
}: Readonly<{ automacao: MensagemAutomatica; onEditar: () => void; onExcluir: () => void }>) {
  const ativar = useAtivarAutomacao();
  const podeEditar = usePermissao('comercial-atendimento.campanhas.editar');
  const podeExcluir = usePermissao('comercial-atendimento.campanhas.excluir');
  return (
    <li className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
      <Switch
        checked={automacao.ativa}
        disabled={!podeEditar || ativar.isPending}
        aria-label={`${automacao.ativa ? 'Desativar' : 'Ativar'} ${automacao.nome}`}
        onCheckedChange={(ativa) => ativar.mutate({ id: automacao.id, ativa })}
      />
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{automacao.nome}</span>
          <Badge variant="secondary">{CAMPANHA_TIPO_ENVIO_ROTULO[automacao.tipoEnvio]}</Badge>
          <Badge variant="outline">{descreverFiltro(automacao)}</Badge>
        </div>
        <p className="truncate text-sm text-muted-foreground">{automacao.mensagem}</p>
      </div>
      <div className="grid justify-items-end gap-0.5 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <ClockIcon aria-hidden className="size-3.5" />
          {automacao.horario}
        </span>
        <span>{descreverDias(automacao.diasSemana)}</span>
        <span className="text-emerald-700 dark:text-emerald-400">
          {automacao.totalEnviados} enviados
        </span>
      </div>
      <div className="flex gap-1">
        {podeEditar && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Editar ${automacao.nome}`}
            onClick={onEditar}
          >
            <PencilIcon aria-hidden />
          </Button>
        )}
        {podeExcluir && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-destructive"
            aria-label={`Excluir ${automacao.nome}`}
            onClick={onExcluir}
          >
            <Trash2Icon aria-hidden />
          </Button>
        )}
      </div>
    </li>
  );
}

/** Aba "Mensagens Automáticas": um cartão por automação, com switch, editar e excluir. */
export function AbaMensagensAutomaticas() {
  const automacoes = useMensagensAutomaticas();
  const excluir = useExcluirAutomacao();
  const [modal, setModal] = useState<{ automacao?: MensagemAutomatica } | null>(null);
  const [excluindo, setExcluindo] = useState<MensagemAutomatica | null>(null);
  const lista = automacoes.data ?? [];

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">
          {lista.length} mensagem(ns) automática(s)
        </span>
        <SePermitido permissao="comercial-atendimento.campanhas.criar">
          <Button type="button" onClick={() => setModal({})}>
            <PlusIcon aria-hidden />
            Nova Automação
          </Button>
        </SePermitido>
      </div>
      {automacoes.isError && (
        <p className="text-sm text-destructive">Não foi possível carregar as automações.</p>
      )}
      {automacoes.isSuccess && lista.length === 0 && (
        <p className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhuma mensagem automática.
        </p>
      )}
      {lista.length > 0 && (
        <ul className="grid gap-3" aria-label="Mensagens automáticas">
          {lista.map((a) => (
            <CartaoAutomacao
              key={a.id}
              automacao={a}
              onEditar={() => setModal({ automacao: a })}
              onExcluir={() => setExcluindo(a)}
            />
          ))}
        </ul>
      )}
      {modal && (
        <ModalMensagemAutomatica automacao={modal.automacao} onFechar={() => setModal(null)} />
      )}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir Automação"
        descricao={`Tem certeza que deseja excluir a automação "${excluindo?.nome ?? ''}"? Esta ação não pode ser desfeita.`}
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
