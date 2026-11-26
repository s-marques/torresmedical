import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cancelarComMotivoSchema,
  type CancelarComMotivoFormulario,
  type CancelarComMotivoInput,
} from '@torres/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/lib/api/api-error';
import { aplicarIdioma } from '@/lib/i18n';
import {
  MOTIVO_ID,
  MOTIVO_OUTRO_ID,
  rotaMotivosCancelamento,
  URL_MOTIVOS,
} from '@/test/motivos-cancelamento';
import { apiFalsa, chamadasPara, json } from '@/test/render-app';
import { useFormulario } from '../form/use-formulario';
import { ModalCancelamento, type OpcaoReagendamento } from './ModalCancelamento';

const NOVO_ID = '00000000-0000-4000-8000-0000000000e1';
const OPCOES: OpcaoReagendamento[] = [{ valor: NOVO_ID, rotulo: '#12 - 29/10/2026 às 10:00' }];

function Harness({
  onConfirmar,
  onFechar = () => undefined,
  opcoesReagendamento,
}: Readonly<{
  onConfirmar: (valores: CancelarComMotivoInput) => Promise<unknown>;
  onFechar?: () => void;
  opcoesReagendamento?: OpcaoReagendamento[];
}>) {
  const form = useFormulario<CancelarComMotivoFormulario, CancelarComMotivoInput>(
    cancelarComMotivoSchema,
    { defaultValues: { motivoId: '', observacao: '', reagendouParaId: '' } },
  );
  return (
    <ModalCancelamento
      tipo="CONSULTA"
      titulo="Cancelar agendamento #7"
      descricao="Paciente Fictício com Profissional Fictício."
      rotuloConfirmar="Cancelar agendamento"
      form={form}
      opcoesReagendamento={opcoesReagendamento}
      onConfirmar={onConfirmar}
      onFechar={onFechar}
    />
  );
}

function montar(
  props: Parameters<typeof Harness>[0],
  fetchMock = apiFalsa({ rotas: rotaMotivosCancelamento }),
) {
  vi.stubGlobal('fetch', fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Harness {...props} />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), fetchMock };
}

async function escolherMotivo(user: ReturnType<typeof userEvent.setup>, nome: string) {
  const modal = await screen.findByRole('dialog', { name: 'Cancelar agendamento #7' });
  await user.click(within(modal).getByRole('combobox', { name: /Motivo/ }));
  await user.click(await screen.findByRole('option', { name: nome }));
  return modal;
}

describe('ModalCancelamento', () => {
  it('pede os motivos do tipo e mostra o contexto do que será cancelado', async () => {
    const { fetchMock } = montar({ onConfirmar: vi.fn() });

    const modal = await screen.findByRole('dialog', { name: 'Cancelar agendamento #7' });
    expect(within(modal).getByText('Paciente Fictício com Profissional Fictício.')).toBeVisible();
    await waitFor(() => expect(chamadasPara(fetchMock, URL_MOTIVOS)).toHaveLength(1));
    expect(chamadasPara(fetchMock, URL_MOTIVOS)[0]?.[0]).toContain('tipo=CONSULTA');
  });

  it('o motivo da lista é obrigatório: sem ele, não cancela', async () => {
    const onConfirmar = vi.fn();
    const { user } = montar({ onConfirmar });

    const modal = await screen.findByRole('dialog', { name: 'Cancelar agendamento #7' });
    await user.click(within(modal).getByRole('button', { name: 'Cancelar agendamento' }));

    expect(await within(modal).findByText('Motivo é obrigatório.')).toBeVisible();
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it('com o motivo e a observação, confirma e fecha', async () => {
    const onConfirmar = vi.fn().mockResolvedValue(undefined);
    const onFechar = vi.fn();
    const { user } = montar({ onConfirmar, onFechar });

    const modal = await escolherMotivo(user, 'Paciente desistiu');
    await user.type(within(modal).getByLabelText('Observação'), 'Viagem');
    await user.click(within(modal).getByRole('button', { name: 'Cancelar agendamento' }));

    await waitFor(() => expect(onFechar).toHaveBeenCalled());
    expect(onConfirmar).toHaveBeenCalledWith({
      motivoId: MOTIVO_ID,
      observacao: 'Viagem',
      reagendouParaId: undefined,
    });
  });

  it('o motivo "Outro" marca a observação como obrigatória e bloqueia sem ela', async () => {
    const onConfirmar = vi.fn().mockResolvedValue(undefined);
    const { user } = montar({ onConfirmar });

    const modal = await escolherMotivo(user, 'Outro');
    expect(within(modal).getByLabelText(/Observação/)).toHaveAttribute('aria-required', 'true');
    await user.click(within(modal).getByRole('button', { name: 'Cancelar agendamento' }));
    expect(await within(modal).findByText('Observação é obrigatória.')).toBeVisible();
    expect(onConfirmar).not.toHaveBeenCalled();

    await user.type(within(modal).getByLabelText(/Observação/), '   ');
    await user.click(within(modal).getByRole('button', { name: 'Cancelar agendamento' }));
    expect(onConfirmar).not.toHaveBeenCalled();

    await user.type(within(modal).getByLabelText(/Observação/), 'Detalhe fictício');
    await user.click(within(modal).getByRole('button', { name: 'Cancelar agendamento' }));
    await waitFor(() => expect(onConfirmar).toHaveBeenCalled());
    expect(onConfirmar.mock.calls[0]?.[0]).toMatchObject({
      motivoId: MOTIVO_OUTRO_ID,
      observacao: 'Detalhe fictício',
    });
  });

  it('"Reagendou?" só aparece quando há opções e liga ao novo agendamento', async () => {
    const onConfirmar = vi.fn().mockResolvedValue(undefined);
    const { user } = montar({ onConfirmar, opcoesReagendamento: OPCOES });

    const modal = await escolherMotivo(user, 'Paciente desistiu');
    await user.click(within(modal).getByRole('combobox', { name: /Reagendou/ }));
    await user.click(await screen.findByRole('option', { name: '#12 - 29/10/2026 às 10:00' }));
    await user.click(within(modal).getByRole('button', { name: 'Cancelar agendamento' }));

    await waitFor(() => expect(onConfirmar).toHaveBeenCalled());
    expect(onConfirmar.mock.calls[0]?.[0]).toMatchObject({ reagendouParaId: NOVO_ID });
  });

  it('sem opções de reagendamento, o campo não existe', async () => {
    montar({ onConfirmar: vi.fn() });
    const modal = await screen.findByRole('dialog', { name: 'Cancelar agendamento #7' });
    expect(within(modal).queryByRole('combobox', { name: /Reagendou/ })).toBeNull();
  });

  it('erro do servidor (400 no motivo) aparece no formulário e não fecha', async () => {
    const onFechar = vi.fn();
    const onConfirmar = vi.fn().mockRejectedValue(
      new ApiRequestError(400, {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos',
        details: [{ field: 'motivoId', message: 'Motivo inválido' }],
        requestId: 'req-1',
      }),
    );
    const { user } = montar({ onConfirmar, onFechar });

    const modal = await escolherMotivo(user, 'Paciente desistiu');
    await user.click(within(modal).getByRole('button', { name: 'Cancelar agendamento' }));

    expect(await within(modal).findByText('Motivo inválido')).toBeVisible();
    expect(onFechar).not.toHaveBeenCalled();
  });

  it('Voltar fecha sem cancelar', async () => {
    const onConfirmar = vi.fn();
    const onFechar = vi.fn();
    const { user } = montar({ onConfirmar, onFechar });

    const modal = await screen.findByRole('dialog', { name: 'Cancelar agendamento #7' });
    await user.click(within(modal).getByRole('button', { name: 'Voltar' }));

    expect(onFechar).toHaveBeenCalled();
    expect(onConfirmar).not.toHaveBeenCalled();
  });

  it('textos em inglês (issue #205)', async () => {
    aplicarIdioma('en');
    const { user } = montar({ onConfirmar: vi.fn(), opcoesReagendamento: OPCOES });

    const modal = await screen.findByRole('dialog', { name: 'Cancelar agendamento #7' });
    expect(within(modal).getByRole('combobox', { name: /Reason/ })).toBeVisible();
    expect(within(modal).getByLabelText('Note')).toBeVisible();
    expect(within(modal).getByRole('combobox', { name: /Rescheduled/ })).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Back' })).toBeVisible();

    await user.click(within(modal).getByRole('button', { name: 'Cancelar agendamento' }));
    expect(await within(modal).findByText('Reason is required.')).toBeVisible();
  });

  it('a API de motivos sem itens deixa o select vazio, sem quebrar', async () => {
    montar({ onConfirmar: vi.fn() }, apiFalsa({ rotas: { [URL_MOTIVOS]: () => json([]) } }));
    const modal = await screen.findByRole('dialog', { name: 'Cancelar agendamento #7' });
    expect(within(modal).getByRole('combobox', { name: /Motivo/ })).toBeVisible();
  });
});
