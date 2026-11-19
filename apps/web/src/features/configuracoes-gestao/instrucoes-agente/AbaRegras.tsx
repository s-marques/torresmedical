import {
  AGENTE_REGRA_ACAO_ROTULO,
  AGENTE_REGRA_ACOES,
  AGENTE_REGRA_GATILHOS,
  AGENTE_REGRA_TIPO_ROTULO,
  AGENTE_REGRA_TIPOS,
  agenteRegraPageSchema,
  createAgenteRegraSchema,
  listAgenteRegraQuerySchema,
  type AgenteRegra,
  type AgenteRegraAcao,
} from '@torres/shared';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, FiltroGrid } from '@/components/shared/data-grid/tipos';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusBadge, type TomStatus } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { usePermissao } from '@/lib/auth/use-sessao';
import {
  URL_REGRAS,
  useAlterarAtivoRegra,
  useExcluirRegra,
  useSalvarRegra,
} from './use-instrucoes-agente';

const PERMISSAO = 'configuracoes-gestao.instrucoes-agente';
const ID_FORMULARIO = 'form-agente-regra';

const OPCOES_TIPO = AGENTE_REGRA_TIPOS.map((valor) => ({
  valor,
  rotulo: AGENTE_REGRA_TIPO_ROTULO[valor],
}));
const OPCOES_ACAO = AGENTE_REGRA_ACOES.map((valor) => ({
  valor,
  rotulo: AGENTE_REGRA_ACAO_ROTULO[valor],
}));
const OPCOES_GATILHO = AGENTE_REGRA_GATILHOS.map((valor) => ({ valor, rotulo: valor }));

const TOM_ACAO: Record<AgenteRegraAcao, TomStatus> = {
  BLOQUEAR: 'perigo',
  SUBSTITUIR: 'neutro',
  ALERTAR: 'neutro',
};

const FILTROS: readonly FiltroGrid[] = [
  { tipo: 'select', parametro: 'tipo', rotulo: 'Tipo', opcoes: OPCOES_TIPO },
  { tipo: 'select', parametro: 'acao', rotulo: 'Ação', opcoes: OPCOES_ACAO },
];

function ModalRegra({
  registro,
  onFechar,
}: Readonly<{ registro?: AgenteRegra; onFechar: () => void }>) {
  const salvar = useSalvarRegra(registro?.id);
  const form = useFormulario(createAgenteRegraSchema, {
    defaultValues: {
      nome: registro?.nome ?? '',
      descricao: registro?.descricao ?? '',
      tipo: registro?.tipo ?? 'POS_RESPOSTA',
      gatilho: registro?.gatilho ?? 'qualquer',
      acao: registro?.acao ?? 'BLOQUEAR',
      ativo: registro?.ativo ?? true,
    },
  });
  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={registro ? 'Editar Regra' : 'Nova Regra'}
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar={registro ? 'Salvar' : 'Criar'}
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        onSubmit={async (valores) => {
          await salvar.mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField
          name="nome"
          label="Nome"
          obrigatorio
          descricao="Letras minúsculas, números e sublinhado. Ex.: uma_pergunta_por_vez"
        />
        <FormField name="descricao" label="Descrição" tipo="textarea" obrigatorio />
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField name="tipo" label="Tipo" tipo="select" opcoes={OPCOES_TIPO} />
          <FormField name="gatilho" label="Gatilho" tipo="select" opcoes={OPCOES_GATILHO} />
          <FormField name="acao" label="Ação" tipo="select" opcoes={OPCOES_ACAO} />
        </div>
        <FormField name="ativo" label="Ativo" tipo="switch" />
      </FormLayout>
    </Modal>
  );
}

/** Aba "Regras": regras de validação do agente (pré-tool e pós-resposta), em grid paginado. */
export function AbaRegras() {
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<AgenteRegra | null>(null);
  const [excluindo, setExcluindo] = useState<AgenteRegra | null>(null);
  const podeEditar = usePermissao(`${PERMISSAO}.editar`);
  const alterarAtivo = useAlterarAtivoRegra();
  const excluir = useExcluirRegra();

  const colunas: ColunaGrid<AgenteRegra>[] = [
    {
      id: 'nome',
      titulo: 'Nome',
      ordenavel: true,
      ocultavel: false,
      celula: (regra) => (
        <div className="max-w-xl whitespace-normal">
          <p className="font-mono text-sm">{regra.nome}</p>
          <p className="text-xs text-muted-foreground">{regra.descricao}</p>
        </div>
      ),
    },
    {
      id: 'tipo',
      titulo: 'Tipo',
      ordenavel: true,
      celula: (regra) => <StatusBadge>{AGENTE_REGRA_TIPO_ROTULO[regra.tipo]}</StatusBadge>,
    },
    { id: 'gatilho', titulo: 'Gatilho', ordenavel: true },
    {
      id: 'acao',
      titulo: 'Ação',
      ordenavel: true,
      celula: (regra) => (
        <StatusBadge tom={TOM_ACAO[regra.acao]}>{AGENTE_REGRA_ACAO_ROTULO[regra.acao]}</StatusBadge>
      ),
    },
    {
      id: 'ativo',
      titulo: 'Ativo',
      celula: (regra) => (
        <Switch
          checked={regra.ativo}
          disabled={!podeEditar || alterarAtivo.isPending}
          aria-label={`${regra.ativo ? 'Desativar' : 'Ativar'} regra ${regra.nome}`}
          onCheckedChange={(ativo) => alterarAtivo.mutate({ id: regra.id, ativo })}
        />
      ),
    },
    {
      id: 'acoes',
      titulo: 'Ações',
      ocultavel: false,
      celula: (regra) => (
        <div className="flex items-center gap-1">
          <SePermitido permissao={`${PERMISSAO}.editar`}>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Editar regra ${regra.nome}`}
              onClick={() => setEditando(regra)}
            >
              <PencilIcon aria-hidden />
            </Button>
          </SePermitido>
          <SePermitido permissao={`${PERMISSAO}.excluir`}>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-destructive hover:text-destructive"
              aria-label={`Excluir regra ${regra.nome}`}
              onClick={() => setExcluindo(regra)}
            >
              <Trash2Icon aria-hidden />
            </Button>
          </SePermitido>
        </div>
      ),
    },
  ];

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <SePermitido permissao={`${PERMISSAO}.criar`}>
          <Button type="button" onClick={() => setCriando(true)}>
            <PlusIcon aria-hidden />
            Nova Regra
          </Button>
        </SePermitido>
      </div>
      <DataGrid
        url={URL_REGRAS}
        schema={agenteRegraPageSchema}
        querySchema={listAgenteRegraQuerySchema}
        colunas={colunas}
        busca="Buscar por nome ou descrição..."
        status={{
          opcoes: [
            { valor: 'ativo', rotulo: 'Ativo' },
            { valor: 'inativo', rotulo: 'Inativo' },
          ],
        }}
        filtros={FILTROS}
        mensagemVazio="Nenhuma regra configurada."
        resumo={(meta) =>
          meta.total === 1 ? '1 regra configurada' : `${meta.total} regras configuradas`
        }
      />
      {criando && <ModalRegra onFechar={() => setCriando(false)} />}
      {editando && <ModalRegra registro={editando} onFechar={() => setEditando(null)} />}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir regra"
        descricao={`Excluir a regra "${excluindo?.nome ?? ''}"? Esta ação não pode ser desfeita.`}
        rotuloConfirmar="Excluir"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
