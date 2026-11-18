import {
  CANAL_WHATSAPP_STATUS_ROTULO,
  formatarTelefoneWhatsapp,
  type CanalWhatsapp,
  type CanalWhatsappStatus,
} from '@torres/shared';
import {
  PencilIcon,
  PlusIcon,
  SmartphoneIcon,
  Trash2Icon,
  UsersIcon,
  WifiIcon,
  WifiOffIcon,
} from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ModalEditarCanal, ModalNovoCanal } from './ModalCanalWhatsapp';
import { ModalUsuariosCanal } from './ModalUsuariosCanal';
import { useCanaisWhatsapp, useExcluirCanal } from './use-canais-whatsapp';

const BREADCRUMB = [{ rotulo: 'Painel', para: '/' }, { rotulo: 'Canais WhatsApp' }];

const TOM_STATUS: Record<CanalWhatsappStatus, TomStatus> = {
  CONECTADO: 'sucesso',
  DESCONECTADO: 'perigo',
  AGUARDANDO_QR: 'alerta',
};

const ROTULO_TIPO = { DINASTI_API: 'DinastiAPI', CLOUD_API: 'Cloud API' } as const;

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

interface CardCanalProps {
  canal: CanalWhatsapp;
  onEditar: () => void;
  onUsuarios: () => void;
  onExcluir: () => void;
}

function CardCanal({ canal, onEditar, onUsuarios, onExcluir }: Readonly<CardCanalProps>) {
  const StatusIcone = canal.status === 'CONECTADO' ? WifiIcon : WifiOffIcon;
  return (
    <li className="grid content-start gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-base font-medium">
          <SmartphoneIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{canal.nome}</span>
        </h2>
        <div className="-mt-1 flex shrink-0 items-center gap-1">
          <SePermitido permissao="configuracoes-gestao.agentes-ia.editar">
            <BotaoIcone rotulo={`Ver / Editar canal ${canal.nome}`} onClick={onEditar}>
              <PencilIcon aria-hidden />
            </BotaoIcone>
            <BotaoIcone rotulo={`Gerenciar usuarios de ${canal.nome}`} onClick={onUsuarios}>
              <UsersIcon aria-hidden />
            </BotaoIcone>
          </SePermitido>
          <SePermitido permissao="configuracoes-gestao.agentes-ia.excluir">
            <BotaoIcone rotulo={`Excluir ${canal.nome}`} onClick={onExcluir} destrutivo>
              <Trash2Icon aria-hidden />
            </BotaoIcone>
          </SePermitido>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Telefone</dt>
        <dd className="text-right font-mono">{formatarTelefoneWhatsapp(canal.numero)}</dd>
        <dt className="text-muted-foreground">Tipo</dt>
        <dd className="justify-self-end">
          <Badge variant="secondary">{ROTULO_TIPO[canal.tipo]}</Badge>
        </dd>
        <dt className="text-muted-foreground">Status</dt>
        <dd className="justify-self-end">
          <StatusBadge tom={TOM_STATUS[canal.status]}>
            <StatusIcone aria-hidden />
            {CANAL_WHATSAPP_STATUS_ROTULO[canal.status]}
          </StatusBadge>
        </dd>
        {canal.profissionalNome && (
          <>
            <dt className="text-muted-foreground">Profissional</dt>
            <dd className="text-right">{canal.profissionalNome}</dd>
          </>
        )}
      </dl>
    </li>
  );
}

/**
 * Agentes IA (`/agentes-ia`, docs/inventario/telas/configuracoes-gestao-agentes-ia.md): "Canais
 * WhatsApp", um card por número com telefone, tipo e status. Cadastro, edição, usuários com
 * acesso e exclusão; a conexão com o provedor (sessão e QR Code) é uma integração à parte (#173).
 */
export default function AgentesIaPage() {
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<CanalWhatsapp | null>(null);
  const [gerenciando, setGerenciando] = useState<CanalWhatsapp | null>(null);
  const [excluindo, setExcluindo] = useState<CanalWhatsapp | null>(null);
  const canais = useCanaisWhatsapp();
  const excluir = useExcluirCanal();

  const lista = canais.data?.data;

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Canais WhatsApp"
        descricao="Gerencie seus canais de WhatsApp conectados."
        breadcrumb={BREADCRUMB}
        acoes={
          <SePermitido permissao="configuracoes-gestao.agentes-ia.criar">
            <Button type="button" onClick={() => setCriando(true)}>
              <PlusIcon aria-hidden />
              Novo Canal
            </Button>
          </SePermitido>
        }
      />
      {canais.isPending && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy>
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-40 rounded-xl" />
          ))}
        </div>
      )}
      {canais.isError && (
        <EmptyState
          titulo="Não foi possível carregar os canais."
          acao={
            <Button type="button" variant="outline" onClick={() => void canais.refetch()}>
              Tentar de novo
            </Button>
          }
        />
      )}
      {lista?.length === 0 && (
        <EmptyState
          icone={SmartphoneIcon}
          titulo="Nenhum canal cadastrado"
          acao={
            <SePermitido permissao="configuracoes-gestao.agentes-ia.criar">
              <Button type="button" variant="outline" onClick={() => setCriando(true)}>
                Criar primeiro canal
              </Button>
            </SePermitido>
          }
        />
      )}
      {lista && lista.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((canal) => (
            <CardCanal
              key={canal.id}
              canal={canal}
              onEditar={() => setEditando(canal)}
              onUsuarios={() => setGerenciando(canal)}
              onExcluir={() => setExcluindo(canal)}
            />
          ))}
        </ul>
      )}
      {criando && <ModalNovoCanal onFechar={() => setCriando(false)} />}
      {editando && <ModalEditarCanal canal={editando} onFechar={() => setEditando(null)} />}
      {gerenciando && (
        <ModalUsuariosCanal canal={gerenciando} onFechar={() => setGerenciando(null)} />
      )}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir canal"
        descricao={`Tem certeza que deseja excluir o canal "${excluindo?.nome ?? ''}"? Esta ação não pode ser desfeita.`}
        rotuloConfirmar="Excluir"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
