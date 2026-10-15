import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiFalsa, json, renderApp } from '../../../test/render-app';
import { ROTA_EXEMPLOS } from '../../routes';

const UNIDADE = {
  id: '00000000-0000-4000-8000-000000000001',
  empresaId: '7a1d3c52-8d0f-4b8e-9f4c-2b2f3c4d5e6f',
  nome: 'Unidade Centro',
  ativo: true,
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
};

const pagina = (data: unknown[]) =>
  json({ data, meta: { page: 1, pageSize: 20, total: data.length, totalPages: 1 } });

function abrir() {
  const fetchMock = apiFalsa({
    rotas: {
      '/api/configuracoes-gestao/unidades': () => pagina([UNIDADE]),
      '/api/lookups/empresas': () =>
        pagina([{ id: UNIDADE.empresaId, label: 'Empresa Exemplo', descricao: null }]),
    },
  });
  renderApp(ROTA_EXEMPLOS, fetchMock);
  return userEvent.setup();
}

describe('página de exemplos dos componentes', { timeout: 20_000 }, () => {
  it('mostra os componentes, com o grid na API de Unidades, fora do menu', async () => {
    abrir();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Componentes compartilhados' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Unidade Centro')).toBeInTheDocument();
    for (const secao of ['DataGrid', 'FormLayout e FormField', 'StatusBadge e EmptyState']) {
      expect(screen.getByRole('heading', { level: 2, name: secao })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Excel' })).toBeInTheDocument();
    // Não há item de menu (nem outro link) para a página.
    expect(document.querySelector(`a[href="${ROTA_EXEMPLOS}"]`)).toBeNull();
  });

  it('edita pelo modal e confirma a exclusão (simuladas)', async () => {
    const user = abrir();
    const linha = (await screen.findByText('Unidade Centro')).closest('tr') as HTMLElement;

    await user.click(within(linha).getByRole('button', { name: 'Ações' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }));
    const modal = await screen.findByRole('dialog', { name: 'Editar unidade' });
    const nome = within(modal).getByLabelText('Nome');
    expect(nome).toHaveValue('Unidade Centro');
    await user.clear(nome);
    await user.type(nome, 'erro');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));
    expect(
      await within(modal).findByText('Valor recusado pelo servidor (exemplo)'),
    ).toBeInTheDocument();
    await user.clear(nome);
    await user.type(nome, 'Unidade Norte');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(within(linha).getByRole('button', { name: 'Ações' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Excluir' }));
    const confirmacao = await screen.findByRole('alertdialog', { name: 'Excluir unidade?' });
    await user.click(within(confirmacao).getByRole('button', { name: 'Excluir' }));
    expect(await screen.findByText('Exemplo: nenhuma unidade foi excluída.')).toBeInTheDocument();
  });

  it('abre o modal de nova unidade e cancela', async () => {
    const user = abrir();

    await user.click(await screen.findByRole('button', { name: 'Nova unidade' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova unidade' });
    await user.click(within(modal).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Nova unidade' })).toHaveFocus();
  });

  it('formulário de exemplo: valida, mostra o erro geral simulado e cancela', async () => {
    const user = abrir();
    const secao = (await screen.findByRole('heading', { name: 'FormLayout e FormField' })).closest(
      'section',
    ) as HTMLElement;

    await user.click(within(secao).getByRole('button', { name: 'Salvar' }));
    expect(await within(secao).findByText('Informe o nome')).toBeInTheDocument();

    await user.click(within(secao).getByLabelText('Nome'));
    await user.paste('Exemplo');
    await user.click(within(secao).getByLabelText('CPF'));
    await user.paste('12345678901');
    await user.click(within(secao).getByLabelText('Valor'));
    await user.paste('1000');
    await user.click(within(secao).getByRole('combobox', { name: 'Tipo' }));
    await user.click(await screen.findByRole('option', { name: 'Retorno' }));
    await user.click(
      within(secao).getByRole('combobox', { name: 'Resposta simulada do servidor:' }),
    );
    await user.click(await screen.findByRole('option', { name: 'Erro 409 (geral)' }));
    await user.click(within(secao).getByRole('button', { name: 'Salvar' }));
    expect(await within(secao).findByRole('alert')).toHaveTextContent('Registro duplicado');

    await user.click(
      within(secao).getByRole('combobox', { name: 'Resposta simulada do servidor:' }),
    );
    await user.click(await screen.findByRole('option', { name: 'Sucesso' }));
    await user.click(within(secao).getByRole('button', { name: 'Salvar' }));
    expect(await within(secao).findByLabelText('Valores enviados')).toHaveTextContent(
      '"cpf": "12345678901"',
    );

    await user.click(within(secao).getByRole('button', { name: 'Cancelar' }));
    expect(within(secao).getByLabelText('Nome')).toHaveValue('');
  });
});
