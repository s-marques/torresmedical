import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { Button } from '@/components/ui/button';
import { EmptyState } from './EmptyState';
import { PageHeader } from './PageHeader';
import { StatusAtivo, StatusBadge } from './StatusBadge';

function renderComRotas(elemento: React.ReactNode) {
  const router = createMemoryRouter([{ path: '/x', element: elemento }], {
    initialEntries: ['/x'],
  });
  return render(<RouterProvider router={router} />);
}

describe('PageHeader', () => {
  it('mostra breadcrumb "Painel > título", título, descrição e ações', () => {
    renderComRotas(
      <PageHeader
        titulo="Veiculos"
        descricao="Gerencie os veiculos."
        acoes={<Button>Novo</Button>}
      />,
    );

    const trilha = screen.getByRole('navigation', { name: 'breadcrumb' });
    expect(within(trilha).getByRole('link', { name: 'Painel' })).toHaveAttribute('href', '/');
    expect(within(trilha).getByText('Veiculos')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { level: 1, name: 'Veiculos' })).toBeInTheDocument();
    expect(screen.getByText('Gerencie os veiculos.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Novo' })).toBeInTheDocument();
  });

  it('aceita breadcrumb próprio', () => {
    renderComRotas(
      <PageHeader
        titulo="Detalhe"
        breadcrumb={[
          { rotulo: 'Painel', para: '/' },
          { rotulo: 'Lista', para: '/lista' },
          { rotulo: 'Detalhe' },
        ]}
      />,
    );

    expect(screen.getByRole('link', { name: 'Lista' })).toHaveAttribute('href', '/lista');
    expect(screen.getByText('Detalhe', { selector: '[aria-current="page"]' })).not.toHaveAttribute(
      'href',
    );
  });
});

describe('StatusBadge e EmptyState', () => {
  it('pinta o status pelo tom', () => {
    render(
      <>
        <StatusBadge tom="alerta">Pendente</StatusBadge>
        <StatusBadge>Cancelado</StatusBadge>
        <StatusAtivo ativo />
        <StatusAtivo ativo={false} />
      </>,
    );

    expect(screen.getByText('Pendente')).toHaveAttribute('data-tom', 'alerta');
    expect(screen.getByText('Cancelado')).toHaveAttribute('data-tom', 'neutro');
    expect(screen.getByText('Ativo')).toHaveAttribute('data-tom', 'sucesso');
    expect(screen.getByText('Inativo')).toHaveAttribute('data-tom', 'perigo');
  });

  it('estado vazio com descrição e ação', () => {
    render(
      <EmptyState titulo="Nada aqui" descricao="Crie o primeiro." acao={<Button>Criar</Button>} />,
    );

    const estado = screen.getByRole('status');
    expect(estado).toHaveTextContent('Nada aqui');
    expect(estado).toHaveTextContent('Crie o primeiro.');
    expect(within(estado).getByRole('button', { name: 'Criar' })).toBeInTheDocument();
  });
});
