import { POLITICA_PADRAO, PREFERENCIAS_PADRAO } from '@torres/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

const POLITICA = { ...POLITICA_PADRAO, updatedAt: null };

function api(politica: unknown = POLITICA, usuario = USUARIO_TESTE) {
  return apiFalsa({
    usuario,
    rotas: {
      '/api/configuracoes-gestao/minha-empresa': () =>
        json({
          id: '00000000-0000-4000-8000-0000000000aa',
          nome: 'Empresa Teste',
          documento: '12345678000190',
          email: null,
          telefone: null,
          logoArquivoId: null,
          updatedAt: '2026-11-25T10:00:00.000Z',
        }),
      '/api/configuracoes-gestao/politica-seguranca': (init) =>
        init?.method === 'PUT'
          ? json({
              ...(JSON.parse(String(init.body)) as object),
              updatedAt: '2026-11-25T11:00:00.000Z',
            })
          : json(politica),
    },
  });
}

async function abrirAba(nome = 'Segurança') {
  await userEvent.click(await screen.findByRole('tab', { name: nome }));
}

describe('Minha Empresa: aba Segurança (issue #156)', () => {
  it('mostra a política atual nos campos', async () => {
    renderApp('/settings/empresa', api({ ...POLITICA, tamanhoMinimo: 12, expiracaoDias: 90 }));

    await abrirAba();

    expect(await screen.findByLabelText('Tamanho mínimo da senha')).toHaveValue(12);
    expect(screen.getByLabelText('Expiração da senha (dias)')).toHaveValue(90);
    expect(screen.getByLabelText('Tentativas de login até bloquear')).toHaveValue(5);
    expect(screen.getByRole('switch', { name: 'Trocar a senha no primeiro acesso' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Exigir símbolo' })).not.toBeChecked();
  });

  it('salva a política alterada e avisa', async () => {
    const fetchMock = api();
    renderApp('/settings/empresa', fetchMock);
    await abrirAba();

    const tamanho = await screen.findByLabelText('Tamanho mínimo da senha');
    await userEvent.clear(tamanho);
    await userEvent.type(tamanho, '14');
    await userEvent.click(screen.getByRole('switch', { name: 'Exigir letra maiúscula' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar política' }));

    expect(await screen.findByText('Política de segurança salva.')).toBeInTheDocument();
    const put = chamadasPara(fetchMock, '/api/configuracoes-gestao/politica-seguranca').find(
      ([, init]) => init?.method === 'PUT',
    );
    expect(JSON.parse(String(put?.[1]?.body))).toMatchObject({
      tamanhoMinimo: 14,
      exigirMaiuscula: true,
      expiracaoDias: null,
    });
  });

  it('recusa valores fora dos limites antes de enviar', async () => {
    const fetchMock = api();
    renderApp('/settings/empresa', fetchMock);
    await abrirAba();

    const tentativas = await screen.findByLabelText('Tentativas de login até bloquear');
    await userEvent.clear(tentativas);
    await userEvent.type(tentativas, '1');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar política' }));

    expect(await screen.findByText('Informe um valor entre 3 e 20')).toBeInTheDocument();
    const puts = chamadasPara(fetchMock, '/api/configuracoes-gestao/politica-seguranca').filter(
      ([, init]) => init?.method === 'PUT',
    );
    expect(puts).toHaveLength(0);
  });

  it('sem a permissão de editar, os campos ficam desabilitados e não há botão de salvar', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      permissoes: USUARIO_TESTE.permissoes.filter(
        (p) => p !== 'configuracoes-gestao.minha-empresa.editar',
      ),
    };
    renderApp('/settings/empresa', api(POLITICA, usuario));
    await abrirAba();

    expect(await screen.findByLabelText('Tamanho mínimo da senha')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Salvar política' })).not.toBeInTheDocument();
  });

  it('em inglês: aba, campos e aviso traduzidos', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' as const },
    };
    renderApp('/settings/empresa', api(POLITICA, usuario));

    await abrirAba('Security');

    const painel = await screen.findByRole('tabpanel', { name: 'Security' });
    expect(await within(painel).findByText('Security policy')).toBeInTheDocument();
    expect(within(painel).getByLabelText('Minimum password length')).toBeInTheDocument();
    expect(within(painel).getByRole('button', { name: 'Save policy' })).toBeInTheDocument();
  });
});
