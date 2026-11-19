import {
  AGENTE_ALERTA_TIPO_ROTULO,
  AGENTE_ALERTA_TIPOS,
  createAgenteAlertaDestinoSchema,
  formatarTelefoneWhatsapp,
  type AgenteAlertaDestino,
} from '@torres/shared';
import { BellRingIcon, PhoneIcon, PlusIcon, Trash2Icon, UsersIcon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdicionarDestino, useDestinos, useExcluirDestino } from './use-instrucoes-agente';

const OPCOES_TIPO = AGENTE_ALERTA_TIPOS.map((valor) => ({
  valor,
  rotulo: AGENTE_ALERTA_TIPO_ROTULO[valor],
}));
const ID_FORMULARIO = 'form-agente-destino';

function numeroLegivel(destino: AgenteAlertaDestino): string {
  return destino.tipo === 'NUMERO' ? formatarTelefoneWhatsapp(destino.numero) : destino.numero;
}

function FormularioDestino() {
  const adicionar = useAdicionarDestino();
  const form = useFormulario(createAgenteAlertaDestinoSchema, {
    defaultValues: { tipo: 'NUMERO', nome: '', numero: '' },
  });
  return (
    <FormLayout
      id={ID_FORMULARIO}
      form={form}
      acoes={null}
      className="grid items-end gap-3 border-t pt-4 sm:grid-cols-[10rem_1fr_1fr_auto]"
      onSubmit={async (valores) => {
        await adicionar.mutateAsync(valores);
        form.reset({ tipo: valores.tipo, nome: '', numero: '' });
      }}
    >
      <FormField name="tipo" label="Tipo" tipo="select" opcoes={OPCOES_TIPO} />
      <FormField name="nome" label="Nome" placeholder="Ex: Felippe" />
      <FormField name="numero" label="Número WhatsApp" placeholder="5565999999999" />
      <Button type="submit" disabled={adicionar.isPending}>
        <PlusIcon aria-hidden />
        Adicionar
      </Button>
    </FormLayout>
  );
}

/** Aba "Alertas do Agente": quem é avisado quando o agente não sabe responder uma dúvida. */
export function AbaAlertas() {
  const destinos = useDestinos();
  const excluir = useExcluirDestino();
  const [excluindo, setExcluindo] = useState<AgenteAlertaDestino | null>(null);
  const lista = destinos.data?.data ?? [];

  return (
    <div className="grid gap-4">
      <div className="text-sm text-muted-foreground">
        <p>
          Configure os números/grupos WhatsApp que receberão alertas quando o agente não souber
          responder uma dúvida do cliente.
        </p>
        <p className="text-xs">
          O bot continua atendendo normalmente enquanto a equipe é notificada sobre dúvidas que
          precisam de resposta humana (preço, prazo, etc.).
        </p>
      </div>
      <section
        aria-labelledby="titulo-destinos"
        className="grid gap-4 rounded-xl border bg-card p-6"
      >
        <h2 id="titulo-destinos" className="flex items-center gap-2 text-lg font-medium">
          <BellRingIcon aria-hidden className="size-5 text-amber-500" />
          Destinos de Notificação
        </h2>
        {destinos.isPending && <Skeleton className="h-14 w-full" />}
        <ul className="grid gap-2">
          {lista.map((destino) => {
            const Icone = destino.tipo === 'NUMERO' ? PhoneIcon : UsersIcon;
            return (
              <li
                key={destino.id}
                className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2"
              >
                <Icone aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{destino.nome}</p>
                  <p className="truncate text-xs text-muted-foreground">{numeroLegivel(destino)}</p>
                </div>
                <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
                  {destino.tipo === 'NUMERO' ? 'whatsapp' : 'grupo'}
                </span>
                <SePermitido permissao="configuracoes-gestao.instrucoes-agente.excluir">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive"
                    aria-label={`Remover ${destino.nome}`}
                    onClick={() => setExcluindo(destino)}
                  >
                    <Trash2Icon aria-hidden />
                  </Button>
                </SePermitido>
              </li>
            );
          })}
        </ul>
        {!destinos.isPending && lista.length === 0 && (
          <p role="status" className="text-sm text-muted-foreground">
            Nenhum destino de notificação cadastrado.
          </p>
        )}
        <SePermitido permissao="configuracoes-gestao.instrucoes-agente.criar">
          <FormularioDestino />
        </SePermitido>
      </section>
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Remover destino"
        descricao={`Remover ${excluindo?.nome ?? ''} dos destinos de notificação?`}
        rotuloConfirmar="Remover"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
