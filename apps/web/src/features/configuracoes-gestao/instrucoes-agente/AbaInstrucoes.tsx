import {
  AGENTE_INSTRUCAO_STATUS_ROTULO,
  AGENTE_INSTRUCAO_TRANSICOES,
  AGENTE_REGRA_FIXA,
  type AgenteInstrucao,
  type AgenteInstrucaoStatus,
} from '@torres/shared';
import { HistoryIcon, PencilIcon, PlusIcon, ShieldAlertIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ModalInstrucao } from './ModalInstrucao';
import { ModalVersoes } from './ModalVersoes';
import {
  useAlterarStatusInstrucao,
  useExcluirInstrucao,
  useInstrucoes,
} from './use-instrucoes-agente';

const PERMISSAO = 'configuracoes-gestao.instrucoes-agente';
const DATA = new Intl.DateTimeFormat('pt-BR');

const TOM_STATUS: Record<AgenteInstrucaoStatus, TomStatus> = {
  RASCUNHO: 'neutro',
  EM_TESTE: 'info',
  APROVADO: 'destaque',
  PUBLICADO: 'sucesso',
};

/** Rótulo do botão que leva a instrução para o status indicado. */
const ACAO_STATUS: Record<AgenteInstrucaoStatus, string> = {
  RASCUNHO: 'Voltar para rascunho',
  EM_TESTE: 'Enviar para teste',
  APROVADO: 'Aprovar',
  PUBLICADO: 'Publicar',
};

function BotaoIcone({
  rotulo,
  onClick,
  destrutivo,
  children,
}: Readonly<{
  rotulo: string;
  onClick: () => void;
  destrutivo?: boolean;
  children: React.ReactNode;
}>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={destrutivo ? 'text-destructive hover:text-destructive' : undefined}
      aria-label={rotulo}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/** Aba "Instruções": cards com o System Prompt, o ciclo de aprovação e o histórico de versões. */
export function AbaInstrucoes() {
  const instrucoes = useInstrucoes();
  const alterarStatus = useAlterarStatusInstrucao();
  const excluir = useExcluirInstrucao();
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<AgenteInstrucao | null>(null);
  const [versoes, setVersoes] = useState<AgenteInstrucao | null>(null);
  const [excluindo, setExcluindo] = useState<AgenteInstrucao | null>(null);
  const lista = instrucoes.data?.data ?? [];

  return (
    <div className="grid gap-4">
      <Alert>
        <ShieldAlertIcon aria-hidden />
        <AlertDescription>
          <strong>Regra fixa, não editável por instrução:</strong> {AGENTE_REGRA_FIXA}
        </AlertDescription>
      </Alert>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {lista.length === 1
            ? '1 instrução configurada'
            : `${lista.length} instruções configuradas`}
        </p>
        <SePermitido permissao={`${PERMISSAO}.criar`}>
          <Button type="button" onClick={() => setCriando(true)}>
            <PlusIcon aria-hidden />
            Nova Instrução
          </Button>
        </SePermitido>
      </div>

      {instrucoes.isPending && <Skeleton className="h-36 w-full" />}
      {!instrucoes.isPending && lista.length === 0 && (
        <EmptyState titulo="Nenhuma instrução configurada." />
      )}
      <ul className="grid gap-4 lg:grid-cols-2">
        {lista.map((instrucao) => (
          <li
            key={instrucao.id}
            className="grid content-start gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-xs"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="min-w-0 text-base font-medium">{instrucao.nome}</h2>
              <div className="flex flex-wrap items-center gap-1">
                <Badge variant="secondary" className="font-mono">
                  {instrucao.modelo}
                </Badge>
                <StatusBadge tom={TOM_STATUS[instrucao.status]}>
                  {AGENTE_INSTRUCAO_STATUS_ROTULO[instrucao.status]}
                </StatusBadge>
                <StatusBadge tom={instrucao.ativo ? 'sucesso' : 'perigo'}>
                  {instrucao.ativo ? 'Ativo' : 'Inativo'}
                </StatusBadge>
              </div>
            </div>
            <p className="line-clamp-2 font-mono text-xs text-muted-foreground">
              {instrucao.systemPrompt}
            </p>
            <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
              <span>
                Temp: {instrucao.temperatura} | Tokens: {instrucao.maxTokens} | Versão{' '}
                {instrucao.versaoAtual}
              </span>
              <span>{DATA.format(new Date(instrucao.createdAt))}</span>
            </div>
            {instrucao.aprovadoPorNome && instrucao.aprovadoEm && (
              <p className="text-xs text-muted-foreground">
                Aprovada por {instrucao.aprovadoPorNome} em{' '}
                {DATA.format(new Date(instrucao.aprovadoEm))}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-1 border-t pt-3">
              <SePermitido permissao={`${PERMISSAO}.editar`}>
                <BotaoIcone
                  rotulo={`Editar ${instrucao.nome}`}
                  onClick={() => setEditando(instrucao)}
                >
                  <PencilIcon aria-hidden />
                </BotaoIcone>
              </SePermitido>
              <BotaoIcone
                rotulo={`Histórico de versões de ${instrucao.nome}`}
                onClick={() => setVersoes(instrucao)}
              >
                <HistoryIcon aria-hidden />
              </BotaoIcone>
              <SePermitido permissao={`${PERMISSAO}.excluir`}>
                <BotaoIcone
                  rotulo={`Excluir ${instrucao.nome}`}
                  destrutivo
                  onClick={() => setExcluindo(instrucao)}
                >
                  <Trash2Icon aria-hidden />
                </BotaoIcone>
              </SePermitido>
              <SePermitido permissao={`${PERMISSAO}.editar`}>
                <div className="ml-auto flex flex-wrap gap-1">
                  {AGENTE_INSTRUCAO_TRANSICOES[instrucao.status].map((destino) => (
                    <Button
                      key={destino}
                      type="button"
                      size="sm"
                      variant={destino === 'RASCUNHO' ? 'ghost' : 'outline'}
                      disabled={alterarStatus.isPending}
                      onClick={() => alterarStatus.mutate({ id: instrucao.id, status: destino })}
                    >
                      {ACAO_STATUS[destino]}
                    </Button>
                  ))}
                </div>
              </SePermitido>
            </div>
          </li>
        ))}
      </ul>

      {criando && <ModalInstrucao onFechar={() => setCriando(false)} />}
      {editando && <ModalInstrucao registro={editando} onFechar={() => setEditando(null)} />}
      {versoes && <ModalVersoes instrucao={versoes} onFechar={() => setVersoes(null)} />}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir instrução"
        descricao={`Excluir "${excluindo?.nome ?? ''}"? Esta ação não pode ser desfeita.`}
        rotuloConfirmar="Excluir"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
