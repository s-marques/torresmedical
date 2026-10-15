import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { LookupItem } from '@torres/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, type FetchFalso } from '../../test/render-app';
import { EntitySelect, type EntitySelectProps } from './EntitySelect';

const BASE = '/api/lookups/pacientes';
const ANA: LookupItem = {
  id: '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  label: 'Ana Teste',
  descricao: '***.456.789-**',
};
const BRUNO: LookupItem = {
  id: '7a1d3c52-8d0f-4b8e-9f4c-2b2f3c4d5e6f',
  label: 'Bruno Teste',
  descricao: null,
};

function pagina(data: LookupItem[], total = data.length) {
  return json({ data, meta: { page: 1, pageSize: 20, total, totalPages: 1 } });
}

function apiLookup(rotas: Record<string, () => Response> = {}): FetchFalso {
  return apiFalsa({ rotas: { [BASE]: () => pagina([ANA, BRUNO]), ...rotas } });
}

/** Wrapper controlado, como o `Controller` do React Hook Form faria. */
function Controlado({
  inicial = null,
  onChange,
  ...props
}: Partial<EntitySelectProps> & { inicial?: string | null }) {
  const [valor, setValor] = useState<string | null>(inicial);
  return (
    <>
      <label htmlFor="paciente">Paciente</label>
      <EntitySelect
        id="paciente"
        entidade="pacientes"
        value={valor}
        onChange={(id, item) => {
          setValor(id);
          onChange?.(id, item);
        }}
        {...props}
      />
    </>
  );
}

function renderizar(
  fetchMock: FetchFalso,
  props: Partial<EntitySelectProps> & { inicial?: string | null } = {},
) {
  vi.stubGlobal('fetch', fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <Controlado onChange={onChange} {...props} />
    </QueryClientProvider>,
  );
  return { onChange, user: userEvent.setup(), combobox: screen.getByRole('combobox') };
}

function urls(fetchMock: FetchFalso, caminho = BASE): URLSearchParams[] {
  return chamadasPara(fetchMock, caminho).map(
    ([url]) => new URL(url, 'http://localhost').searchParams,
  );
}

describe('EntitySelect', () => {
  it('não consulta a API até abrir; ao abrir lista rótulo e descrição', async () => {
    const fetchMock = apiLookup();
    const { user, combobox } = renderizar(fetchMock);

    expect(combobox).toHaveTextContent('Selecione');
    expect(combobox).toHaveAccessibleName('Paciente');
    expect(chamadasPara(fetchMock, BASE)).toHaveLength(0);

    await user.click(combobox);

    expect(await screen.findByRole('option', { name: /Ana Teste/ })).toHaveTextContent(
      '***.456.789-**',
    );
    expect(screen.getByRole('option', { name: /Bruno Teste/ })).toBeInTheDocument();
    expect(combobox).toHaveAttribute('aria-expanded', 'true');
    const [params] = urls(fetchMock);
    expect(params?.get('pageSize')).toBe('20');
    expect(params?.has('search')).toBe(false);
  });

  it('busca na API ao digitar (com atraso) e envia os filtros', async () => {
    const fetchMock = apiLookup();
    const { user, combobox } = renderizar(fetchMock, {
      entidade: 'formas-pagamento',
      filtros: { finalidade: 'receber' },
    });
    const caminho = '/api/lookups/formas-pagamento';
    fetchMock.mockImplementation(async () => pagina([ANA]));

    await user.click(combobox);
    await user.type(screen.getByPlaceholderText('Buscar…'), 'ana');

    await waitFor(() => expect(urls(fetchMock, caminho).at(-1)?.get('search')).toBe('ana'));
    expect(urls(fetchMock, caminho).every((p) => p.get('finalidade') === 'receber')).toBe(true);
    // Sem uma consulta por tecla: a primeira (lista aberta) e a da busca final.
    expect(urls(fetchMock, caminho).map((p) => p.get('search'))).toEqual([null, 'ana']);
  });

  it('seleciona com o mouse: chama onChange e mostra o rótulo', async () => {
    const fetchMock = apiLookup();
    const { user, combobox, onChange } = renderizar(fetchMock);

    await user.click(combobox);
    await user.click(await screen.findByRole('option', { name: /Bruno Teste/ }));

    expect(onChange).toHaveBeenCalledWith(BRUNO.id, BRUNO);
    expect(combobox).toHaveTextContent('Bruno Teste');
    expect(combobox).toHaveAttribute('aria-expanded', 'false');
    // O rótulo veio da seleção: não precisa buscar o item pelo id.
    expect(chamadasPara(fetchMock, `${BASE}/${BRUNO.id}`)).toHaveLength(0);
  });

  it('funciona pelo teclado', async () => {
    const fetchMock = apiLookup();
    const { user, combobox, onChange } = renderizar(fetchMock);

    combobox.focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('option', { name: /Ana Teste/ });
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledWith(BRUNO.id, BRUNO);
  });

  it('valor vindo de fora: busca o rótulo pelo id (inclusive fora da primeira página)', async () => {
    const fetchMock = apiLookup({ [`${BASE}/${ANA.id}`]: () => json(ANA) });
    const { combobox } = renderizar(fetchMock, { inicial: ANA.id });

    expect(combobox).toHaveTextContent('Carregando…');
    await waitFor(() => expect(combobox).toHaveTextContent('Ana Teste'));
    expect(chamadasPara(fetchMock, BASE)).toHaveLength(0);
  });

  it('valor que não existe mais aparece como indisponível', async () => {
    const { combobox } = renderizar(apiLookup(), { inicial: BRUNO.id });

    await waitFor(() => expect(combobox).toHaveTextContent('Registro indisponível'));
  });

  it('limpa a seleção', async () => {
    const fetchMock = apiLookup({ [`${BASE}/${ANA.id}`]: () => json(ANA) });
    const { user, combobox, onChange } = renderizar(fetchMock, { inicial: ANA.id });

    await user.click(combobox);
    await user.click(await screen.findByRole('option', { name: 'Limpar seleção' }));

    expect(onChange).toHaveBeenCalledWith(null, null);
    expect(combobox).toHaveTextContent('Selecione');
  });

  it('sem a opção de limpar quando permitirLimpar é false', async () => {
    const fetchMock = apiLookup({ [`${BASE}/${ANA.id}`]: () => json(ANA) });
    const { user, combobox } = renderizar(fetchMock, { inicial: ANA.id, permitirLimpar: false });

    await user.click(combobox);
    await screen.findByRole('option', { name: /Ana Teste/ });

    expect(screen.queryByRole('option', { name: 'Limpar seleção' })).not.toBeInTheDocument();
  });

  it('mostra quando não há resultados', async () => {
    const { user, combobox } = renderizar(apiLookup({ [BASE]: () => pagina([]) }));
    await user.click(combobox);
    expect(await screen.findByText('Nenhum resultado encontrado.')).toBeInTheDocument();
  });

  it('mostra erro ao falhar a consulta', async () => {
    const erro = json({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'Erro' }, 500);
    const { user, combobox } = renderizar(apiLookup({ [BASE]: () => erro }));

    await user.click(combobox);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar as opções.',
    );
  });

  it('avisa quando há mais resultados que os exibidos', async () => {
    const { user, combobox } = renderizar(apiLookup({ [BASE]: () => pagina([ANA, BRUNO], 57) }));

    await user.click(combobox);

    expect(await screen.findByText(/Mostrando 2 de 57/)).toHaveTextContent('Refine a busca');
  });

  it('desabilitado não abre', async () => {
    const fetchMock = apiLookup();
    const { user, combobox } = renderizar(fetchMock, { disabled: true });

    await user.click(combobox);

    expect(combobox).toBeDisabled();
    expect(chamadasPara(fetchMock, BASE)).toHaveLength(0);
  });
});
