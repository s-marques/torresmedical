import { PREFERENCIAS_PADRAO, type MotivoCancelamento } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

const API = '/api/configuracoes-gestao/motivos-cancelamento';
const ID_1 = '00000000-0000-4000-8000-0000000000f1';
const ID_2 = '00000000-0000-4000-8000-0000000000f2';

function motivo(parcial: Partial<MotivoCancelamento>): MotivoCancelamento {
  return {
    id: ID_1,
    tipo: 'CONSULTA',
    nome: 'Paciente desistiu',
    codigo: 'paciente_desistiu',
    exigeTexto: false,
    sistema: false,
    ordem: 1,
    ativo: true,
    createdAt: '2026-11-25T12:00:00.000Z',
    updatedAt: '2026-11-25T12:00:00.000Z',
    ...parcial,
  };
}

const MOTIVOS = [
  motivo({}),
  motivo({
    id: ID_2,
    tipo: 'CONTRATO',
    nome: 'Outro',
    codigo: 'outro',
    exigeTexto: true,
    sistema: true,
    ordem: 99,
  }),
];

function pagina(data: MotivoCancelamento[]) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
}

type Usuario = ReturnType<typeof userEvent.setup>;
const corpoDe = (init?: RequestInit) => JSON.parse(String(init?.body)) as Record<string, unknown>;

function api(
  rotas: NonNullable<Parameters<typeof apiFalsa>[0]>['rotas'] = {},
  usuario = USUARIO_TESTE,
) {
  return apiFalsa({ usuario, rotas: { [API]: () => pagina(MOTIVOS), ...rotas } });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/config/motivos-cancelamento', fetchMock) };
}

async function abrirMenu(user: Usuario, linha: string, item: string) {
  const tr = (await screen.findByText(linha)).closest('tr') as HTMLElement;
  await user.click(within(tr).getByRole('button', { name: 'Ações' }));
  return screen.findByRole('menuitem', { name: item });
}

async function escolher(user: Usuario, modal: HTMLElement, campo: RegExp | string, opcao: string) {
  await user.click(within(modal).getByRole('combobox', { name: campo }));
  await user.click(await screen.findByRole('option', { name: opcao }));
}

describe('Motivos de Cancelamento (/config/motivos-cancelamento)', { timeout: 20_000 }, () => {
  it('mostra título, filtros e as colunas, com o motivo de sistema marcado', async () => {
    const fetchMock = api();
    renderTela(fetchMock);

    expect(await screen.findByRole('heading', { name: 'Motivos de Cancelamento' })).toBeVisible();
    await screen.findByText('Paciente desistiu');
    const cabecalhos = within(screen.getByRole('table'))
      .getAllByRole('columnheader')
      .map((c) => c.textContent);
    expect(cabecalhos).toEqual(['Tipo', 'Motivo', 'Exige observação', 'Situação', 'Ações']);
    const outro = screen.getByText('Outro').closest('tr') as HTMLElement;
    expect(within(outro).getByText('Sistema')).toBeVisible();
    expect(within(outro).getByText('Contrato')).toBeVisible();
    expect(within(outro).getByText('Sim')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Novo motivo' })).toBeVisible();
    expect(screen.getByPlaceholderText('Buscar motivo...')).toBeVisible();
  });

  it('filtra por tipo na consulta à API', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Paciente desistiu');

    await user.click(screen.getByRole('combobox', { name: 'Tipo' }));
    await user.click(await screen.findByRole('option', { name: 'Contrato' }));

    await waitFor(() => {
      const [url] = chamadasPara(fetchMock, API).at(-1) ?? [''];
      expect(new URL(url, 'http://x').searchParams.get('tipo')).toBe('CONTRATO');
    });
  });

  it('Novo motivo: valida o nome e envia tipo, nome e exigência de observação', async () => {
    let corpo: Record<string, unknown> | null = null;
    const fetchMock = api({
      [API]: (init) => {
        if (init?.method === 'POST') {
          corpo = corpoDe(init);
          return json(motivo({ id: ID_2, tipo: 'PROPOSTA', nome: 'Preço alto' }), 201);
        }
        return pagina(MOTIVOS);
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Paciente desistiu');

    await user.click(screen.getByRole('button', { name: 'Novo motivo' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo motivo de cancelamento' });
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));
    expect(await within(modal).findByText('Nome é obrigatório.')).toBeVisible();
    expect(corpo).toBeNull();

    await escolher(user, modal, /Tipo de cancelamento/, 'Proposta');
    await user.type(within(modal).getByLabelText(/Nome do motivo/), 'Preço alto');
    await user.click(within(modal).getByRole('switch'));
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({ tipo: 'PROPOSTA', nome: 'Preço alto', exigeTexto: true });
  });

  it('Editar: preenche o motivo e envia só nome, observação e situação', async () => {
    let corpo: Record<string, unknown> | null = null;
    const fetchMock = api({
      [`${API}/${ID_1}`]: (init) => {
        corpo = corpoDe(init);
        return json(motivo({ nome: 'Desistência' }));
      },
    });
    const { user } = renderTela(fetchMock);

    await user.click(await abrirMenu(user, 'Paciente desistiu', 'Editar'));
    const modal = await screen.findByRole('dialog', { name: 'Editar motivo de cancelamento' });
    const nome = within(modal).getByLabelText(/Nome do motivo/);
    expect(nome).toHaveValue('Paciente desistiu');
    await user.clear(nome);
    await user.type(nome, 'Desistência');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({ nome: 'Desistência', exigeTexto: false, ativo: true });
  });

  it('motivo de sistema: campos travados, aviso e exclusão desabilitada', async () => {
    const { user } = renderTela();

    await user.click(await abrirMenu(user, 'Outro', 'Editar'));
    const modal = await screen.findByRole('dialog', { name: 'Editar motivo de cancelamento' });
    expect(within(modal).getByText(/Motivo usado pelo sistema/)).toBeVisible();
    expect(within(modal).getByLabelText(/Nome do motivo/)).toBeDisabled();
    for (const chave of within(modal).getAllByRole('switch')) expect(chave).toBeDisabled();
    await user.click(within(modal).getByRole('button', { name: 'Cancelar' }));

    const tr = screen.getByText('Outro').closest('tr') as HTMLElement;
    await user.click(within(tr).getByRole('button', { name: 'Ações' }));
    expect(await screen.findByRole('menuitem', { name: 'Excluir' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('Excluir: confirma antes e chama DELETE', async () => {
    let excluiu = false;
    const fetchMock = api({
      [`${API}/${ID_1}`]: (init) => {
        excluiu = init?.method === 'DELETE';
        return json(motivo({}));
      },
    });
    const { user } = renderTela(fetchMock);

    await user.click(await abrirMenu(user, 'Paciente desistiu', 'Excluir'));
    const dialogo = await screen.findByRole('alertdialog');
    expect(within(dialogo).getByText(/Paciente desistiu/)).toBeVisible();
    expect(excluiu).toBe(false);
    await user.click(within(dialogo).getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(excluiu).toBe(true));
  });

  it('sem permissão de criar, editar e excluir, não mostra os botões', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      permissoes: ['configuracoes-gestao.motivos-cancelamento.ver' as const],
    };
    renderTela(api({}, usuario));

    await screen.findByText('Paciente desistiu');
    expect(screen.queryByRole('button', { name: 'Novo motivo' })).toBeNull();
  });

  it('textos em inglês (issue #205)', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' as const },
    };
    renderTela(api({}, usuario));

    expect(await screen.findByRole('heading', { name: 'Cancellation Reasons' })).toBeVisible();
    expect(await screen.findByText('Appointment')).toBeVisible();
    expect(screen.getByRole('button', { name: 'New reason' })).toBeVisible();
    expect(screen.getByText('System')).toBeVisible();
  });
});
