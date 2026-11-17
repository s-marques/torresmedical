import {
  recebimentoInputSchema,
  type PagamentoAtendimento,
  type RecebimentoFormulario,
} from '@torres/shared';
import { CreditCardIcon } from 'lucide-react';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissao } from '@/lib/auth/use-sessao';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { formatarDataHora } from '@/lib/formatar';
import { usePagamento, useRegistrarRecebimento } from './use-atendimento-medico';

const ID_FORMULARIO = 'form-recebimento';

/** Aba "Pagamento": card "Registrar Recebimento" (recebimento parcial ou total da consulta). */
export function AbaPagamento({
  agendamentoId,
  cancelado,
}: Readonly<{ agendamentoId: string; cancelado: boolean }>) {
  const { data, isPending, isError } = usePagamento(agendamentoId);
  const podeRegistrar = usePermissao('consultorio-assistencial.atendimento-medico.criar');

  if (isPending)
    return <Skeleton className="mx-auto h-64 w-full max-w-md" aria-label="Carregando" />;
  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Não foi possível carregar o pagamento.
      </p>
    );
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader className="grid gap-3">
        <CardTitle className="flex items-center gap-2 text-base text-primary">
          <CreditCardIcon aria-hidden className="size-4" />
          Registrar Recebimento
        </CardTitle>
        <div className="flex justify-center">
          <StatusBadge tom={data.pago ? 'sucesso' : 'perigo'}>
            {data.pago ? 'Pago' : 'Não Pago'}
          </StatusBadge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Resumo pagamento={data} />
        {data.recebimentos.length > 0 && (
          <ul className="grid gap-1 text-sm" aria-label="Recebimentos">
            {data.recebimentos.map((r) => (
              <li key={r.id} className="flex justify-between gap-2 text-muted-foreground">
                <span>
                  {formatarDataHora(r.recebidoEm)} · {r.formaPagamentoNome}
                </span>
                <span>{formatarMoeda(r.valor)}</span>
              </li>
            ))}
          </ul>
        )}
        {podeRegistrar && !data.pago && !cancelado && (
          <FormRecebimento agendamentoId={agendamentoId} pagamento={data} />
        )}
      </CardContent>
    </Card>
  );
}

function Resumo({ pagamento }: Readonly<{ pagamento: PagamentoAtendimento }>) {
  const linhas = [
    { rotulo: 'Valor da consulta', valor: pagamento.valorConsulta, classe: 'font-semibold' },
    { rotulo: 'Já recebido', valor: pagamento.recebido, classe: 'font-semibold text-emerald-600' },
    { rotulo: 'Saldo a receber', valor: pagamento.saldo, classe: 'font-semibold' },
  ];
  return (
    <dl className="grid gap-1 rounded-md border p-3 text-sm">
      {linhas.map(({ rotulo, valor, classe }) => (
        <div key={rotulo} className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{rotulo}</dt>
          <dd className={classe}>{valor === null ? '-' : formatarMoeda(valor)}</dd>
        </div>
      ))}
    </dl>
  );
}

function FormRecebimento({
  agendamentoId,
  pagamento,
}: Readonly<{ agendamentoId: string; pagamento: PagamentoAtendimento }>) {
  const registrar = useRegistrarRecebimento(agendamentoId);
  const valoresIniciais = {
    valor: pagamento.saldo,
    formaPagamentoId: '',
  } as unknown as RecebimentoFormulario;
  const form = useFormulario(recebimentoInputSchema, { defaultValues: valoresIniciais });
  const opcoes = pagamento.formasPagamento.map((f) => ({ valor: f.id, rotulo: f.label }));

  return (
    <FormLayout
      id={ID_FORMULARIO}
      form={form}
      acoes={<FormAcoes form={form} formId={ID_FORMULARIO} rotuloEnviar="Registrar Pagamento" />}
      onSubmit={async (valores) => {
        await registrar.mutateAsync(valores);
      }}
    >
      <FormField name="valor" label="Valor a Receber (R$)" tipo="moeda" obrigatorio />
      <FormField
        name="formaPagamentoId"
        label="Forma de Pagamento"
        tipo="select"
        opcoes={opcoes}
        placeholder="Selecione"
        obrigatorio
        descricao={
          <>
            Cartão se lança pela <strong>Agenda</strong>: a conciliação precisa de bandeira, NSU e
            parcelas, que só existem no modal de recebimento de lá.
          </>
        }
      />
    </FormLayout>
  );
}
