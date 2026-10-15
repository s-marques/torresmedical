import { MENU } from '@torres/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { matchMediaStub } from '../../test/match-media';
import { AppSidebar } from './AppSidebar';

function renderSidebar(path = '/', permissoes?: readonly string[]) {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <SidebarProvider>
            <AppSidebar permissoes={permissoes} />
            <SidebarTrigger />
          </SidebarProvider>
        ),
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

/** Botões de módulo do acordeão, na ordem em que aparecem. */
function botoesDeModulo() {
  const nomes = new Set(MENU.map((m) => m.nome));
  return screen.getAllByRole('button').filter((b) => nomes.has(b.textContent ?? ''));
}

function modulosAbertos() {
  return botoesDeModulo()
    .filter((b) => b.getAttribute('aria-expanded') === 'true')
    .map((b) => b.textContent);
}

describe('AppSidebar', () => {
  it('mostra os 9 módulos na ordem do inventário', () => {
    renderSidebar('/');

    expect(botoesDeModulo().map((b) => b.textContent)).toEqual(MENU.map((m) => m.nome));
  });

  it('mostra as telas de cada módulo, na ordem do inventário, ao abrir o módulo', async () => {
    renderSidebar('/nao-existe');

    for (const modulo of MENU) {
      await userEvent.click(screen.getByRole('button', { name: modulo.nome }));
      const links = screen
        .getAllByRole('link')
        .filter((link) => link.dataset.slot === 'sidebar-menu-button');
      expect(links.map((link) => link.textContent)).toEqual(modulo.telas.map((t) => t.nome));
      expect(links.map((link) => link.getAttribute('href'))).toEqual(
        modulo.telas.map((t) => t.rota),
      );
    }
  });

  it('abre o módulo da rota atual e marca a tela ativa', () => {
    renderSidebar('/clientes');

    expect(modulosAbertos()).toEqual(['COMERCIAL / ATENDIMENTO']);
    const ativo = screen.getByRole('link', { name: 'Pacientes' });
    expect(ativo).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Pipeline' })).not.toHaveAttribute('aria-current');
  });

  it('não marca /crm como ativa em /crm/relatorios', () => {
    renderSidebar('/crm/relatorios');

    expect(screen.getByRole('link', { name: 'Relatórios' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Pipeline' })).not.toHaveAttribute('aria-current');
  });

  it('mantém um módulo aberto por vez', async () => {
    renderSidebar('/');
    expect(modulosAbertos()).toEqual(['PAINEL']);

    await userEvent.click(screen.getByRole('button', { name: 'FINANCEIRO' }));
    expect(modulosAbertos()).toEqual(['FINANCEIRO']);

    await userEvent.click(screen.getByRole('button', { name: 'FINANCEIRO' }));
    expect(modulosAbertos()).toEqual([]);
  });

  it('abre o módulo da nova rota ao navegar', async () => {
    const router = renderSidebar('/');

    await userEvent.click(screen.getByRole('button', { name: 'FINANCEIRO' }));
    await userEvent.click(screen.getByRole('link', { name: 'Caixas' }));
    expect(router.state.location.pathname).toBe('/caixas');

    await router.navigate('/estoque');
    expect(await screen.findByRole('link', { name: 'Estoque' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(modulosAbertos()).toEqual(['COMPRAS / ESTOQUE']);
  });

  it('mostra o módulo atual no topo do menu', () => {
    renderSidebar('/receber');

    const topo = screen.getByRole('link', { name: /Torres Medical/ });
    expect(within(topo).getByText('FINANCEIRO')).toBeInTheDocument();
  });

  it('mostra só as telas permitidas quando recebe a lista de permissões', () => {
    renderSidebar('/clientes', ['comercial-atendimento.pacientes.ver', 'financeiro.caixas.ver']);

    expect(botoesDeModulo().map((b) => b.textContent)).toEqual([
      'COMERCIAL / ATENDIMENTO',
      'FINANCEIRO',
    ]);
    expect(screen.getByRole('link', { name: 'Pacientes' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Pipeline' })).not.toBeInTheDocument();
  });

  it('recolhe e expande o menu pelo botão do cabeçalho', async () => {
    renderSidebar('/');
    const sidebar = () => document.querySelector('[data-slot="sidebar"][data-state]');
    expect(sidebar()).toHaveAttribute('data-state', 'expanded');

    const [trigger] = screen.getAllByRole('button', { name: 'Alternar menu' });
    await userEvent.click(trigger!);

    expect(sidebar()).toHaveAttribute('data-state', 'collapsed');
  });

  it('no celular abre em drawer e fecha ao escolher uma tela', async () => {
    vi.stubGlobal('matchMedia', (query: string) => matchMediaStub(query, true));
    const router = renderSidebar('/');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const [trigger] = screen.getAllByRole('button', { name: 'Alternar menu' });
    await userEvent.click(trigger!);
    const drawer = await screen.findByRole('dialog', { name: 'Menu' });
    await userEvent.click(within(drawer).getByRole('link', { name: 'Busca Inteligente' }));

    expect(router.state.location.pathname).toBe('/busca');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
