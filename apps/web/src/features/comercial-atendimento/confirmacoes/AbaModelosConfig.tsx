import {
  CONFIRMACAO_ANTECEDENCIAS,
  confirmacaoConfigInputSchema,
  type ConfirmacaoConfig,
  type ConfirmacaoConfigFormulario,
  type ConfirmacaoModelo,
} from '@torres/shared';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { AJUDA_VARIAVEIS, ModalModelo } from './ModalModelo';
import {
  useConfiguracaoConfirmacao,
  useExcluirModelo,
  useModelosConfirmacao,
  useSalvarConfiguracao,
} from './use-confirmacoes';

const OPCOES_ANTECEDENCIA = CONFIRMACAO_ANTECEDENCIAS.map((dias) => ({
  valor: String(dias),
  rotulo: dias === 1 ? '1 dia antes' : `${dias} dias antes`,
}));

function valoresIniciais(c: ConfirmacaoConfig): ConfirmacaoConfigFormulario {
  return {
    ativo: c.ativo,
    antecedenciaDias: String(c.antecedenciaDias),
    horarioLembrete: c.horarioLembrete,
    horarioMsg1: c.horarioMsg1,
    horarioMsg2: c.horarioMsg2,
    horarioMsg3: c.horarioMsg3,
    horarioNaoConfirmou: c.horarioNaoConfirmou,
    mensagemCriacao: c.mensagemCriacao,
    mensagemConfirmada: c.mensagemConfirmada,
    mensagemJaConfirmado: c.mensagemJaConfirmado,
  };
}

function FormularioConfiguracao({ config }: Readonly<{ config: ConfirmacaoConfig }>) {
  const salvar = useSalvarConfiguracao();
  const form = useFormulario(confirmacaoConfigInputSchema, {
    defaultValues: valoresIniciais(config),
  });
  return (
    <section className="grid gap-4 rounded-lg border p-4">
      <h2 className="text-base font-semibold">Configuração Geral</h2>
      <FormLayout
        form={form}
        colunas={3}
        acoes={
          <SePermitido permissao="comercial-atendimento.confirmacoes.editar">
            <div className="flex justify-end">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Salvar Configuração
              </Button>
            </div>
          </SePermitido>
        }
        onSubmit={(valores) => salvar.mutateAsync(valores)}
      >
        <FormField name="ativo" label="Ativo (envio automático)" tipo="switch" />
        <FormField
          name="antecedenciaDias"
          label="Antecedência das mensagens"
          tipo="select"
          opcoes={OPCOES_ANTECEDENCIA}
        />
        <div className="hidden lg:block" aria-hidden />
        <FormField name="horarioLembrete" label="Lembrete (dia)" tipo="hora" obrigatorio />
        <FormField name="horarioMsg1" label="MSG 1" tipo="hora" obrigatorio />
        <FormField name="horarioMsg2" label="MSG 2" tipo="hora" obrigatorio />
        <FormField name="horarioMsg3" label="MSG 3" tipo="hora" obrigatorio />
        <FormField name="horarioNaoConfirmou" label="Não Confirmou" tipo="hora" obrigatorio />
        <div className="hidden lg:block" aria-hidden />
        <FormField
          name="mensagemCriacao"
          label="Mensagem ao Criar Agendamento (template genérico)"
          tipo="textarea"
          descricao={AJUDA_VARIAVEIS}
          obrigatorio
          className="sm:col-span-2 lg:col-span-3"
        />
        <FormField
          name="mensagemConfirmada"
          label="Resposta a quem CONFIRMA (agradecimento)"
          tipo="textarea"
          descricao={AJUDA_VARIAVEIS}
          obrigatorio
          className="sm:col-span-2 lg:col-span-3"
        />
        <FormField
          name="mensagemJaConfirmado"
          label="Resposta a quem clica DE NOVO (já confirmado)"
          tipo="textarea"
          descricao={AJUDA_VARIAVEIS}
          obrigatorio
          className="sm:col-span-2 lg:col-span-3"
        />
      </FormLayout>
    </section>
  );
}

function CartaoModelo({
  modelo,
  onEditar,
  onExcluir,
}: Readonly<{ modelo: ConfirmacaoModelo; onEditar: () => void; onExcluir: () => void }>) {
  const textos: [string, string][] = [
    ['MSG1', modelo.msg1],
    ['MSG2', modelo.msg2],
    ['MSG3', modelo.msg3],
    ['Lembrete (confirmou)', modelo.lembreteConfirmado],
    ['Lembrete (não confirmou)', modelo.lembreteNaoConfirmado],
  ];
  return (
    <article className="grid gap-3 rounded-lg border p-4" aria-label={`Modelo ${modelo.tipo}`}>
      <header className="flex items-center justify-between gap-2">
        <h3 className="rounded-md bg-muted px-2 py-0.5 text-sm font-semibold">{modelo.tipo}</h3>
        <div className="flex gap-1">
          <SePermitido permissao="comercial-atendimento.confirmacoes.editar">
            <Button type="button" variant="ghost" size="sm" onClick={onEditar}>
              <PencilIcon aria-hidden />
              Editar
            </Button>
          </SePermitido>
          <SePermitido permissao="comercial-atendimento.confirmacoes.excluir">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={onExcluir}
            >
              <Trash2Icon aria-hidden />
              Excluir
            </Button>
          </SePermitido>
        </div>
      </header>
      <div className="grid gap-2 sm:grid-cols-3">
        {textos.map(([rotulo, texto]) => (
          <div key={rotulo} className="rounded-md border p-2 text-sm">
            <p className="text-xs text-muted-foreground">{rotulo}</p>
            <p className="line-clamp-3 whitespace-pre-line">{texto}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

/** Aba Modelos e Config: configuração geral e modelos de mensagem por tipo de agendamento. */
export function AbaModelosConfig() {
  const config = useConfiguracaoConfirmacao();
  const modelos = useModelosConfirmacao();
  const excluir = useExcluirModelo();
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState<ConfirmacaoModelo | null>(null);
  const [excluindo, setExcluindo] = useState<ConfirmacaoModelo | null>(null);

  return (
    <div className="grid gap-6">
      {config.data && <FormularioConfiguracao config={config.data} />}
      <section className="grid gap-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Modelos de Mensagem por Tipo</h2>
            <p className="text-sm text-muted-foreground">
              Cada tipo de agendamento pode ter mensagens personalizadas. Sem modelo, vale o texto
              padrão.
            </p>
          </div>
          <SePermitido permissao="comercial-atendimento.confirmacoes.criar">
            <Button type="button" onClick={() => setCriando(true)}>
              <PlusIcon aria-hidden />
              Novo Modelo
            </Button>
          </SePermitido>
        </div>
        {modelos.data?.length === 0 && <EmptyState titulo="Nenhum modelo cadastrado." />}
        {modelos.data?.map((modelo) => (
          <CartaoModelo
            key={modelo.id}
            modelo={modelo}
            onEditar={() => setEditando(modelo)}
            onExcluir={() => setExcluindo(modelo)}
          />
        ))}
      </section>
      {criando && <ModalModelo onFechar={() => setCriando(false)} />}
      {editando && <ModalModelo modelo={editando} onFechar={() => setEditando(null)} />}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir Modelo"
        descricao={`Tem certeza que deseja excluir o modelo "${excluindo?.tipo ?? ''}"? O tipo volta a usar o texto padrão.`}
        rotuloConfirmar="Excluir"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
