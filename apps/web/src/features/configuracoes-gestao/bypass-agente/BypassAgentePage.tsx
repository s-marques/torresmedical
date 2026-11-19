import {
  bypassAgentePageSchema,
  formatarTelefoneWhatsapp,
  listBypassAgenteQuerySchema,
  type BypassAgente,
} from '@torres/shared';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid } from '@/components/shared/data-grid/tipos';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { usePermissao } from '@/lib/auth/use-sessao';
import { ModalBypassAgente } from './ModalBypassAgente';
import { URL_BYPASS_AGENTE, useAlterarStatusBypass, useExcluirBypass } from './use-bypass-agente';

const BREADCRUMB = [
  { rotulo: 'Painel', para: '/' },
  { rotulo: 'Configurações' },
  { rotulo: 'Bypass Agente' },
];

const VAZIO = '—';

/**
 * Bypass Agente (`/bypass-agente`,
 * docs/inventario/telas/configuracoes-gestao-bypass-agente.md): telefones que o agente IA não
 * responde; as mensagens desses números vão direto para a fila de atendentes.
 */
export default function BypassAgentePage() {
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<BypassAgente | null>(null);
  const [excluindo, setExcluindo] = useState<BypassAgente | null>(null);
  const podeEditar = usePermissao('configuracoes-gestao.bypass-agente.editar');
  const alterarStatus = useAlterarStatusBypass();
  const excluir = useExcluirBypass();

  const colunas: ColunaGrid<BypassAgente>[] = [
    {
      id: 'telefone',
      titulo: 'Telefone',
      ordenavel: true,
      ocultavel: false,
      celula: (registro) => formatarTelefoneWhatsapp(registro.telefone),
    },
    {
      id: 'nome',
      titulo: 'Nome',
      ordenavel: true,
      celula: (registro) => registro.nome ?? VAZIO,
    },
    {
      id: 'cargo',
      titulo: 'Cargo',
      ordenavel: true,
      celula: (registro) => registro.cargo ?? VAZIO,
    },
    {
      id: 'ativo',
      titulo: 'Status',
      celula: (registro) => (
        <Switch
          checked={registro.ativo}
          disabled={!podeEditar || alterarStatus.isPending}
          aria-label={`${registro.ativo ? 'Desativar' : 'Ativar'} bypass de ${registro.nome ?? formatarTelefoneWhatsapp(registro.telefone)}`}
          onCheckedChange={(ativo) => alterarStatus.mutate({ id: registro.id, ativo })}
        />
      ),
    },
    {
      id: 'acoes',
      titulo: 'Ações',
      ocultavel: false,
      celula: (registro) => (
        <div className="flex items-center gap-1">
          <SePermitido permissao="configuracoes-gestao.bypass-agente.editar">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Editar ${registro.nome ?? formatarTelefoneWhatsapp(registro.telefone)}`}
              onClick={() => setEditando(registro)}
            >
              <PencilIcon aria-hidden />
            </Button>
          </SePermitido>
          <SePermitido permissao="configuracoes-gestao.bypass-agente.excluir">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-destructive hover:text-destructive"
              aria-label={`Excluir ${registro.nome ?? formatarTelefoneWhatsapp(registro.telefone)}`}
              onClick={() => setExcluindo(registro)}
            >
              <Trash2Icon aria-hidden />
            </Button>
          </SePermitido>
        </div>
      ),
    },
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Bypass Agente"
        descricao="Telefones que não serão respondidos pelo agente IA. As mensagens desses números vão direto para a fila de atendentes."
        breadcrumb={BREADCRUMB}
        acoes={
          <SePermitido permissao="configuracoes-gestao.bypass-agente.criar">
            <Button type="button" onClick={() => setCriando(true)}>
              <PlusIcon aria-hidden />
              Adicionar
            </Button>
          </SePermitido>
        }
      />
      <DataGrid
        url={URL_BYPASS_AGENTE}
        schema={bypassAgentePageSchema}
        querySchema={listBypassAgenteQuerySchema}
        colunas={colunas}
        busca="Buscar por nome, telefone ou cargo..."
        mensagemVazio="Nenhum telefone no bypass."
      />
      {criando && <ModalBypassAgente onFechar={() => setCriando(false)} />}
      {editando && <ModalBypassAgente registro={editando} onFechar={() => setEditando(null)} />}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Remover do bypass"
        descricao={`Remover ${excluindo ? (excluindo.nome ?? formatarTelefoneWhatsapp(excluindo.telefone)) : ''} da lista? O agente IA volta a responder esse número.`}
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
