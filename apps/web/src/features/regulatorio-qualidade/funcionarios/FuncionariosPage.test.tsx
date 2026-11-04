import { type Cargo, type Funcionario } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API_FUNCIONARIOS = '/api/regulatorio-qualidade/funcionarios';
const API_CARGOS = '/api/regulatorio-qualidade/cargos';
const ID_1 = '00000000-0000-4000-8000-0000000000f1';
const CARGO_ID = '00000000-0000-4000-8000-0000000000c1';

function funcionario(parcial: Partial<Funcionario> = {}): Funcionario {
  return {
    id: ID_1,
    nome: 'Ana Teste',
    cpf: null,
    rg: null,
    dataNascimento: null,
    dataAdmissao: null,
    telefone: '65999998888',
    email: null,
    endereco: null,
    cargoId: CARGO_ID,
    cargoNome: 'Recepcionista',
    departamento: 'Atendimento',
    salario: '1800.00',
    tipoContrato: 'CLT',
    cargaHoraria: 40,
    pis: null,
    ctps: null,
    banco: null,
    agencia: null,
    conta: null,
    ativo: true,
    observacoes: null,
    createdAt: '2026-10-14T12:00:00.000Z',
    updatedAt: '2026-10-14T12:00:00.000Z',
    ...parcial,
  };
}

function cargo(parcial: Partial<Cargo> = {}): Cargo {
  return {
    id: CARGO_ID,
    nome: 'Recepcionista',
    departamento: 'Atendimento',
    descricao: null,
    salarioBase: '1800.00',
    ativo: true,
    createdAt: '2026-10-14T12:00:00.000Z',
    updatedAt: '2026-10-14T12:00:00.000Z',
    ...parcial,
  };
}

function pagina<T>(data: T[]) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
}

function renderTela(
  fetchMock = apiFalsa({
    rotas: {
      [API_FUNCIONARIOS]: () => pagina([funcionario()]),
      [API_CARGOS]: () => pagina([cargo()]),
    },
  }),
) {
  return { user: userEvent.setup(), ...renderApp('/funcionarios', fetchMock) };
}

describe('Funcionários (/funcionarios)', () => {
  it('mostra título, abas, ações e colunas da aba Funcionarios', async () => {
    renderTela();

    expect(await screen.findByRole('heading', { name: 'Recursos Humanos' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Funcionarios' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Cargos' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Comissoes' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Novo Funcionario' })).toBeVisible();

    const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
    expect(cabecalhos.map((c) => c.textContent)).toEqual([
      'Nome',
      'Cargo',
      'Departamento',
      'Telefone',
      'Tipo Contrato',
      'Salario',
      'Status',
      'Ações',
    ]);
    const linha = (await screen.findByText('Ana Teste')).closest('tr') as HTMLElement;
    expect(within(linha).getByText('Recepcionista')).toBeVisible();
    expect(within(linha).getByText('Atendimento')).toBeVisible();
    expect(within(linha).getByText('CLT')).toBeVisible();
    expect(within(linha).getByText(/1\.800,00/)).toBeVisible();
    expect(within(linha).getByText('Ativo')).toBeVisible();
  });

  it('troca para a aba Cargos e mostra a listagem de cargos', async () => {
    const { user } = renderTela();
    await screen.findByText('Ana Teste');

    await user.click(screen.getByRole('tab', { name: 'Cargos' }));

    expect(await screen.findByText('Recepcionista')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Novo Cargo' })).toBeVisible();
  });

  it('aba Comissoes começa vazia, pedindo para selecionar um funcionário', async () => {
    const { user } = renderTela();
    await screen.findByText('Ana Teste');

    await user.click(screen.getByRole('tab', { name: 'Comissoes' }));

    expect(await screen.findByText(/Selecione um funcionario na aba "Funcionarios"/)).toBeVisible();
  });

  it('Novo Funcionario: só o nome é obrigatório e nada é enviado sem ele', async () => {
    const { fetchMock, user } = renderTela();
    await screen.findByText('Ana Teste');

    await user.click(screen.getByRole('button', { name: 'Novo Funcionario' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Funcionario' });
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    expect(await within(modal).findByText('Nome é obrigatório.')).toBeVisible();
    expect(
      chamadasPara(fetchMock, API_FUNCIONARIOS).filter(([, i]) => i?.method === 'POST'),
    ).toHaveLength(0);
  });

  it('Novo Funcionario: envia o nome, fecha o modal e recarrega a lista', async () => {
    let corpo: unknown;
    const fetchMock = apiFalsa({
      rotas: {
        [API_FUNCIONARIOS]: (init) => {
          if (init?.method !== 'POST') return pagina([funcionario()]);
          corpo = JSON.parse(String(init.body));
          return json(
            funcionario({ id: '00000000-0000-4000-8000-0000000000f2', nome: 'Novo' }),
            201,
          );
        },
        [API_CARGOS]: () => pagina([cargo()]),
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Ana Teste');

    await user.click(screen.getByRole('button', { name: 'Novo Funcionario' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Funcionario' });
    await user.type(within(modal).getByLabelText('Nome'), 'Novo');
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({ nome: 'Novo' });
  });

  it('Editar Funcionario: abre preenchido e envia as alterações', async () => {
    let corpo: unknown;
    const fetchMock = apiFalsa({
      rotas: {
        [API_FUNCIONARIOS]: () => pagina([funcionario()]),
        [`${API_FUNCIONARIOS}/${ID_1}`]: (init) => {
          corpo = JSON.parse(String(init?.body));
          return json(funcionario({ nome: 'Ana Editada' }));
        },
        [API_CARGOS]: () => pagina([cargo()]),
      },
    });
    const { user } = renderTela(fetchMock);
    const linha = (await screen.findByText('Ana Teste')).closest('tr') as HTMLElement;

    await user.click(within(linha).getByRole('button', { name: 'Ações' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }));
    const modal = await screen.findByRole('dialog', { name: 'Editar Funcionario' });
    expect(within(modal).getByLabelText('Nome')).toHaveValue('Ana Teste');
    await user.clear(within(modal).getByLabelText('Nome'));
    await user.type(within(modal).getByLabelText('Nome'), 'Ana Editada');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({ nome: 'Ana Editada' });
  });

  it('Excluir Funcionario: confirma e chama DELETE', async () => {
    const fetchMock = apiFalsa({
      rotas: {
        [API_FUNCIONARIOS]: () => pagina([funcionario()]),
        [`${API_FUNCIONARIOS}/${ID_1}`]: () => json(funcionario()),
        [API_CARGOS]: () => pagina([cargo()]),
      },
    });
    const { user } = renderTela(fetchMock);
    const linha = (await screen.findByText('Ana Teste')).closest('tr') as HTMLElement;

    await user.click(within(linha).getByRole('button', { name: 'Ações' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Excluir' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }));

    await waitFor(() =>
      expect(
        chamadasPara(fetchMock, `${API_FUNCIONARIOS}/${ID_1}`).filter(
          ([, i]) => i?.method === 'DELETE',
        ),
      ).toHaveLength(1),
    );
  });

  it('Desativar Funcionario: confirma e envia PATCH com status inativo', async () => {
    let corpo: unknown;
    const fetchMock = apiFalsa({
      rotas: {
        [API_FUNCIONARIOS]: () => pagina([funcionario()]),
        [`${API_FUNCIONARIOS}/${ID_1}`]: (init) => {
          corpo = JSON.parse(String(init?.body));
          return json(funcionario({ ativo: false }));
        },
        [API_CARGOS]: () => pagina([cargo()]),
      },
    });
    const { user } = renderTela(fetchMock);
    const linha = (await screen.findByText('Ana Teste')).closest('tr') as HTMLElement;

    await user.click(within(linha).getByRole('button', { name: 'Ações' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Desativar' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Desativar' }));

    await waitFor(() => expect((corpo as { status?: string } | undefined)?.status).toBe('inativo'));
  });

  describe('aba Cargos', () => {
    it('Novo Cargo: só o nome é obrigatório e envia os demais campos', async () => {
      let corpo: unknown;
      const fetchMock = apiFalsa({
        rotas: {
          [API_FUNCIONARIOS]: () => pagina([funcionario()]),
          [API_CARGOS]: (init) => {
            if (init?.method !== 'POST') return pagina([cargo()]);
            corpo = JSON.parse(String(init.body));
            return json(
              cargo({ id: '00000000-0000-4000-8000-0000000000c2', nome: 'Gerente' }),
              201,
            );
          },
        },
      });
      const { user } = renderTela(fetchMock);
      await screen.findByText('Ana Teste');
      await user.click(screen.getByRole('tab', { name: 'Cargos' }));
      await screen.findByText('Recepcionista');

      await user.click(screen.getByRole('button', { name: 'Novo Cargo' }));
      const modal = await screen.findByRole('dialog', { name: 'Novo Cargo' });
      await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));
      expect(await within(modal).findByText('Nome é obrigatório.')).toBeVisible();

      await user.type(within(modal).getByLabelText('Nome'), 'Gerente');
      await user.type(within(modal).getByLabelText('Departamento'), 'Diretoria');
      await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(corpo).toMatchObject({ nome: 'Gerente', departamento: 'Diretoria' });
    });

    it('Editar e Excluir Cargo', async () => {
      let editado: unknown;
      const fetchMock = apiFalsa({
        rotas: {
          [API_FUNCIONARIOS]: () => pagina([funcionario()]),
          [API_CARGOS]: () => pagina([cargo()]),
          [`${API_CARGOS}/${CARGO_ID}`]: (init) => {
            if (init?.method === 'PATCH') {
              editado = JSON.parse(String(init.body));
              return json(cargo({ nome: 'Recepcionista Chefe' }));
            }
            return json(cargo());
          },
        },
      });
      const { user } = renderTela(fetchMock);
      await screen.findByText('Ana Teste');
      await user.click(screen.getByRole('tab', { name: 'Cargos' }));
      const linha = (await screen.findByText('Recepcionista')).closest('tr') as HTMLElement;

      await user.click(within(linha).getByRole('button', { name: 'Ações' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Editar' }));
      const modal = await screen.findByRole('dialog', { name: 'Editar Cargo' });
      await user.clear(within(modal).getByLabelText('Nome'));
      await user.type(within(modal).getByLabelText('Nome'), 'Recepcionista Chefe');
      await user.click(within(modal).getByRole('button', { name: 'Salvar' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(editado).toMatchObject({ nome: 'Recepcionista Chefe' });

      await user.click(within(linha).getByRole('button', { name: 'Ações' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Excluir' }));
      const dialog = await screen.findByRole('alertdialog');
      await user.click(within(dialog).getByRole('button', { name: 'Excluir' }));
      await waitFor(() =>
        expect(
          chamadasPara(fetchMock, `${API_CARGOS}/${CARGO_ID}`).filter(
            ([, i]) => i?.method === 'DELETE',
          ),
        ).toHaveLength(1),
      );
    });
  });

  describe('aba Comissoes', () => {
    function urlComissoes() {
      return `${API_FUNCIONARIOS}/${ID_1}/comissoes`;
    }

    it('ação "Comissoes" do funcionário abre a aba com a lista e permite lançar, editar e excluir', async () => {
      const COMISSAO_ID = '00000000-0000-4000-8000-0000000000e1';
      let ultimoCorpo: unknown;
      let ultimoMetodo: string | undefined;
      const fetchMock = apiFalsa({
        rotas: {
          [API_FUNCIONARIOS]: () => pagina([funcionario()]),
          [API_CARGOS]: () => pagina([cargo()]),
          [urlComissoes()]: (init) => {
            if (init?.method === 'POST') {
              ultimoMetodo = 'POST';
              ultimoCorpo = JSON.parse(String(init.body));
              return json(
                {
                  id: COMISSAO_ID,
                  funcionarioId: ID_1,
                  valor: '150.00',
                  dataReferencia: '2026-02-01',
                  descricao: 'Venda',
                  status: 'pendente',
                  createdAt: '2026-02-01T00:00:00.000Z',
                  updatedAt: '2026-02-01T00:00:00.000Z',
                },
                201,
              );
            }
            return pagina([
              {
                id: COMISSAO_ID,
                funcionarioId: ID_1,
                valor: '150.00',
                dataReferencia: '2026-02-01',
                descricao: 'Venda',
                status: 'pendente',
                createdAt: '2026-02-01T00:00:00.000Z',
                updatedAt: '2026-02-01T00:00:00.000Z',
              },
            ]);
          },
          [`${urlComissoes()}/${COMISSAO_ID}`]: (init) => {
            ultimoMetodo = init?.method;
            if (init?.body) ultimoCorpo = JSON.parse(String(init.body));
            return json({
              id: COMISSAO_ID,
              funcionarioId: ID_1,
              valor: '150.00',
              dataReferencia: '2026-02-01',
              descricao: 'Venda',
              status: 'paga',
              createdAt: '2026-02-01T00:00:00.000Z',
              updatedAt: '2026-02-01T00:00:00.000Z',
            });
          },
        },
      });
      const { user } = renderTela(fetchMock);
      const linha = (await screen.findByText('Ana Teste')).closest('tr') as HTMLElement;

      await user.click(within(linha).getByRole('button', { name: 'Ações' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Comissoes' }));

      expect(await screen.findByText(/Comissões de/)).toBeVisible();
      expect(await screen.findByText('Venda')).toBeVisible();

      await user.click(screen.getByRole('button', { name: 'Nova Comissão' }));
      const modalNova = await screen.findByRole('dialog', { name: 'Nova Comissão' });
      await user.type(within(modalNova).getByLabelText('Valor'), '15000');
      await user.type(within(modalNova).getByLabelText('Data de Referência'), '2026-02-01');
      await user.click(within(modalNova).getByRole('button', { name: 'Lançar' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(ultimoMetodo).toBe('POST');
      expect(ultimoCorpo).toMatchObject({ valor: 150 });

      const linhaComissao = (await screen.findByText('Venda')).closest('tr') as HTMLElement;
      await user.click(within(linhaComissao).getByRole('button', { name: 'Ações' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Excluir' }));
      const dialog = await screen.findByRole('alertdialog');
      await user.click(within(dialog).getByRole('button', { name: 'Excluir' }));
      await waitFor(() => expect(ultimoMetodo).toBe('DELETE'));
    });
  });

  it('filtra pelo chip Inativo', async () => {
    const fetchMock = apiFalsa({
      rotas: {
        [API_FUNCIONARIOS]: () => pagina([funcionario()]),
        [API_CARGOS]: () => pagina([cargo()]),
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Ana Teste');

    await user.click(screen.getByRole('button', { name: 'Inativo' }));

    await waitFor(() => {
      const [url] = chamadasPara(fetchMock, API_FUNCIONARIOS).at(-1) ?? [''];
      expect(new URL(url, 'http://x').searchParams.get('status')).toBe('inativo');
    });
  });
});
