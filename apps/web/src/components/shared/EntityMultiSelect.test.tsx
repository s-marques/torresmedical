import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LookupItem } from '@torres/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFalsa, json } from '../../test/render-app';
import { EntityMultiSelect, type ItemSelecionado } from './EntityMultiSelect';

const ANA: LookupItem = {
  id: '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  label: 'Ana Teste',
  descricao: null,
};
const BRUNO: LookupItem = {
  id: '7a1d3c52-8d0f-4b8e-9f4c-2b2f3c4d5e6f',
  label: 'Bruno Teste',
  descricao: null,
};

/** Wrapper controlado, como o `FormField` faria. */
function Controlado({
  inicial = [],
  iniciais,
  onChange,
}: {
  inicial?: string[];
  iniciais?: ItemSelecionado[];
  onChange: (ids: string[]) => void;
}) {
  const [ids, setIds] = useState<string[]>(inicial);
  return (
    <>
      <label htmlFor="profissionais">Profissionais</label>
      <EntityMultiSelect
        id="profissionais"
        entidade="profissionais"
        value={ids}
        iniciais={iniciais}
        vazio="Nenhum profissional."
        onChange={(novos) => {
          setIds(novos);
          onChange(novos);
        }}
      />
    </>
  );
}

function renderizar(props: Partial<Parameters<typeof Controlado>[0]> = {}) {
  vi.stubGlobal(
    'fetch',
    apiFalsa({
      rotas: {
        '/api/lookups/profissionais': () =>
          json({ data: [ANA, BRUNO], meta: { page: 1, pageSize: 20, total: 2, totalPages: 1 } }),
      },
    }),
  );
  const onChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Controlado onChange={onChange} {...props} />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), onChange };
}

describe('EntityMultiSelect', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sem seleção mostra o texto de vazio', () => {
    renderizar();
    expect(screen.getByText('Nenhum profissional.')).toBeVisible();
  });

  it('acrescenta itens pelo combobox, sem repetir', async () => {
    const { user, onChange } = renderizar();

    await user.click(screen.getByRole('combobox', { name: 'Profissionais' }));
    await user.click(await screen.findByRole('option', { name: /Ana Teste/ }));
    await user.click(screen.getByRole('combobox', { name: 'Profissionais' }));
    await user.click(await screen.findByRole('option', { name: /Bruno Teste/ }));
    await user.click(screen.getByRole('combobox', { name: 'Profissionais' }));
    await user.click(await screen.findByRole('option', { name: /Ana Teste/ }));

    expect(onChange).toHaveBeenLastCalledWith([ANA.id, BRUNO.id]);
    const chips = within(screen.getByRole('list', { name: 'Selecionados' }));
    expect(chips.getByText('Ana Teste')).toBeVisible();
    expect(chips.getByText('Bruno Teste')).toBeVisible();
  });

  it('usa os rótulos iniciais e remove pelo "x" do chip', async () => {
    const { user, onChange } = renderizar({
      inicial: [ANA.id, BRUNO.id],
      iniciais: [
        { id: ANA.id, nome: 'Ana Teste' },
        { id: BRUNO.id, nome: 'Bruno Teste' },
      ],
    });

    await user.click(screen.getByRole('button', { name: 'Remover Ana Teste' }));

    expect(onChange).toHaveBeenLastCalledWith([BRUNO.id]);
    expect(screen.queryByText('Ana Teste')).not.toBeInTheDocument();
  });

  it('sem rótulo conhecido, mostra o id', () => {
    renderizar({ inicial: [ANA.id] });
    expect(screen.getByText(ANA.id)).toBeVisible();
  });
});
