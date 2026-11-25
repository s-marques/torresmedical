import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BuscaGlobalResponse } from '@torres/shared';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { aplicarIdioma } from '@/lib/i18n';
import { CommandPalette } from './CommandPalette';
import { apiFalsa, chamadasPara, json, renderApp } from '../../test/render-app';

const URL_BUSCA = '/api/painel/busca';
const ID = '00000000-0000-4000-8000-0000000000a1';

const RESULTADO: BuscaGlobalResponse = {
  grupos: [
    {
      tipo: 'PACIENTE',
      itens: [
        {
          id: ID,
          titulo: 'Paciente Alfa Teste',
          descricao: '***.533.447-**',
          rota: '/clientes?search=alfa',
        },
      ],
    },
    {
      tipo: 'CONTRATO',
      itens: [
        {
          id: ID,
          titulo: 'Contrato nº 12',
          descricao: 'Dra. Alfa · Sala 7',
          rota: '/salas?search=12',
        },
      ],
    },
  ],
};

async function abrir() {
  await screen.findByRole('button', { name: 'Menu do usuário' });
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  return within(await screen.findByRole('dialog'));
}

describe('CommandPalette: busca global de registros', () => {
  it('busca registros depois de 2 caracteres, agrupa por tipo e navega ao escolher', async () => {
    const fetchMock = apiFalsa({ rotas: { [URL_BUSCA]: () => json(RESULTADO) } });
    const { router } = renderApp('/', fetchMock);
    const dialogo = await abrir();

    await userEvent.type(dialogo.getByRole('combobox'), 'alfa');

    expect(await dialogo.findByText('Paciente Alfa Teste')).toBeInTheDocument();
    expect(dialogo.getByText('***.533.447-**')).toBeInTheDocument();
    expect(dialogo.getByText('Pacientes')).toBeInTheDocument();
    expect(dialogo.getByText('Contratos')).toBeInTheDocument();
    expect(dialogo.getByText('Contrato nº 12')).toBeInTheDocument();
    const ultima = chamadasPara(fetchMock, URL_BUSCA).at(-1)?.[0];
    expect(ultima).toContain('q=alfa');

    await userEvent.click(dialogo.getByRole('option', { name: /Paciente Alfa Teste/ }));

    expect(router.state.location.pathname).toBe('/clientes');
    expect(router.state.location.search).toBe('?search=alfa');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('não consulta a API com menos de 2 caracteres (exceto número)', async () => {
    const fetchMock = apiFalsa({ rotas: { [URL_BUSCA]: () => json({ grupos: [] }) } });
    renderApp('/', fetchMock);
    const dialogo = await abrir();

    await userEvent.type(dialogo.getByRole('combobox'), 'a');
    await new Promise((r) => setTimeout(r, 400));
    expect(chamadasPara(fetchMock, URL_BUSCA)).toHaveLength(0);

    await userEvent.clear(dialogo.getByRole('combobox'));
    await userEvent.type(dialogo.getByRole('combobox'), '7');
    await waitFor(() => expect(chamadasPara(fetchMock, URL_BUSCA)).toHaveLength(1));
  });

  it('continua filtrando as telas e mostra o aviso quando nada é encontrado', async () => {
    renderApp('/', apiFalsa({ rotas: { [URL_BUSCA]: () => json({ grupos: [] }) } }));
    const dialogo = await abrir();

    await userEvent.type(dialogo.getByRole('combobox'), 'xyzxyz');

    expect(await dialogo.findByText('Nenhuma tela encontrada.')).toBeInTheDocument();
  });

  it('se a busca de registros falha, as telas continuam disponíveis', async () => {
    renderApp(
      '/',
      apiFalsa({
        rotas: {
          [URL_BUSCA]: () => json({ statusCode: 500, code: 'INTERNAL', message: 'Erro' }, 500),
        },
      }),
    );
    const dialogo = await abrir();

    await userEvent.type(dialogo.getByRole('combobox'), 'contas a pagar');

    expect(await dialogo.findByRole('option', { name: 'Contas a Pagar' })).toBeInTheDocument();
  });

  it('limpa o termo ao fechar', async () => {
    renderApp('/', apiFalsa({ rotas: { [URL_BUSCA]: () => json({ grupos: [] }) } }));
    let dialogo = await abrir();
    await userEvent.type(dialogo.getByRole('combobox'), 'alfa');

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    dialogo = within(await screen.findByRole('dialog'));

    expect(dialogo.getByRole('combobox')).toHaveValue('');
  });

  it('mostra os grupos traduzidos em inglês', async () => {
    aplicarIdioma('en');
    vi.stubGlobal('fetch', apiFalsa({ rotas: { [URL_BUSCA]: () => json(RESULTADO) } }));
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <CommandPalette open onOpenChange={() => undefined} permissoes={[]} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const dialogo = within(await screen.findByRole('dialog'));

    await userEvent.type(dialogo.getByRole('combobox'), 'alfa');

    expect(await dialogo.findByText('Patients')).toBeInTheDocument();
    expect(dialogo.getByText('Contracts')).toBeInTheDocument();
  });
});
