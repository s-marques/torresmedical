import { createAgenteInstrucaoExtraSchema, type AgenteInstrucaoExtra } from '@torres/shared';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { usePermissao } from '@/lib/auth/use-sessao';
import {
  useAlterarAtivoExtra,
  useExcluirExtra,
  useExtras,
  useSalvarExtra,
} from './use-instrucoes-agente';

const PERMISSAO = 'configuracoes-gestao.instrucoes-agente';
const ID_FORMULARIO = 'form-agente-extra';

function ModalExtra({
  registro,
  onFechar,
}: Readonly<{ registro?: AgenteInstrucaoExtra; onFechar: () => void }>) {
  const salvar = useSalvarExtra(registro?.id);
  const form = useFormulario(createAgenteInstrucaoExtraSchema, {
    defaultValues: {
      titulo: registro?.titulo ?? '',
      descricao: registro?.descricao ?? '',
      ativo: registro?.ativo ?? true,
    },
  });
  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={registro ? 'Editar Instrução Extra' : 'Nova Instrução Extra'}
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
        <FormField name="titulo" label="Título" obrigatorio />
        <FormField name="descricao" label="Descrição" tipo="textarea" obrigatorio />
        <FormField name="ativo" label="Ativo" tipo="switch" />
      </FormLayout>
    </Modal>
  );
}

/** Aba "Instruções Extras": promoções, regras especiais e informações adicionais enviadas ao agente. */
export function AbaExtras() {
  const extras = useExtras();
  const alterarAtivo = useAlterarAtivoExtra();
  const excluir = useExcluirExtra();
  const podeEditar = usePermissao(`${PERMISSAO}.editar`);
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<AgenteInstrucaoExtra | null>(null);
  const [excluindo, setExcluindo] = useState<AgenteInstrucaoExtra | null>(null);
  const lista = extras.data?.data ?? [];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          <p>
            Instruções extras enviadas ao agente (promoções, regras especiais, informações
            adicionais).
          </p>
          <p className="text-xs">
            Todas as instruções <strong>ativas</strong> são injetadas automaticamente no prompt do
            agente.
          </p>
        </div>
        <SePermitido permissao={`${PERMISSAO}.criar`}>
          <Button type="button" onClick={() => setCriando(true)}>
            <PlusIcon aria-hidden />
            Nova Instrução Extra
          </Button>
        </SePermitido>
      </div>
      {extras.isPending && <Skeleton className="h-24 w-full" />}
      {!extras.isPending && lista.length === 0 && (
        <EmptyState titulo="Nenhuma instrução extra configurada." />
      )}
      <ul className="grid gap-3">
        {lista.map((extra) => (
          <li
            key={extra.id}
            className="flex items-start gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-xs"
          >
            <div className="grid min-w-0 flex-1 gap-1">
              <h2 className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {extra.titulo}
                <StatusBadge tom={extra.ativo ? 'sucesso' : 'neutro'}>
                  {extra.ativo ? 'Ativo' : 'Inativo'}
                </StatusBadge>
              </h2>
              <p className="line-clamp-3 text-sm whitespace-pre-line text-muted-foreground">
                {extra.descricao}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Switch
                checked={extra.ativo}
                disabled={!podeEditar || alterarAtivo.isPending}
                aria-label={`${extra.ativo ? 'Desativar' : 'Ativar'} ${extra.titulo}`}
                onCheckedChange={(ativo) => alterarAtivo.mutate({ id: extra.id, ativo })}
              />
              <SePermitido permissao={`${PERMISSAO}.editar`}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Editar ${extra.titulo}`}
                  onClick={() => setEditando(extra)}
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
                  aria-label={`Excluir ${extra.titulo}`}
                  onClick={() => setExcluindo(extra)}
                >
                  <Trash2Icon aria-hidden />
                </Button>
              </SePermitido>
            </div>
          </li>
        ))}
      </ul>
      {criando && <ModalExtra onFechar={() => setCriando(false)} />}
      {editando && <ModalExtra registro={editando} onFechar={() => setEditando(null)} />}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir instrução extra"
        descricao={`Excluir "${excluindo?.titulo ?? ''}"? O agente deixa de receber esta instrução.`}
        rotuloConfirmar="Excluir"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
