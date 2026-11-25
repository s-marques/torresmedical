import { PREFERENCIAS_PADRAO, type Alerta } from '@torres/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '../../../test/render-app';

const URL_ALERTAS = '/api/painel/alertas';
const ID_VENCENDO = '00000000-0000-4000-8000-000000000001';
const ID_VENCIDAS = '00000000-0000-4000-8000-000000000002';

function alerta(extra: Partial<Alerta>): Alerta {
  return {
    id: ID_VENCIDAS,
    tipo: 'CONTAS_PAGAR_VENCIDAS',
    data: '2026-11-25',
    quantidade: 2,
    rota: '/pagar?status=VENCIDO',
    lido: false,
    resolvido: false,
    ...extra,
  };
}

const VENCENDO = alerta({
  id: ID_VENCENDO,
  tipo: 'CONTAS_PAGAR_VENCENDO',
  quantidade: 1,
  rota: '/pagar?status=PENDENTE&vencimentoDe=2026-11-25&vencimentoAte=2026-11-25',
});

/** API com os alertas dados; as marcações respondem o alerta alterado. */
function api(alertas: Alerta[] = [VENCENDO, alerta({})], usuario = USUARIO_TESTE) {
  const naoLidos = alertas.filter((a) => !a.lido && !a.resolvido).length;
  return apiFalsa({
    usuario,
    rotas: {
      [URL_ALERTAS]: () => json({ data: alertas, naoLidos }),
      [`${URL_ALERTAS}/${ID_VENCENDO}/lido`]: () => json({ ...VENCENDO, lido: true }),
      [`${URL_ALERTAS}/${ID_VENCIDAS}/resolvido`]: () =>
        json(alerta({ lido: true, resolvido: true })),
    },
  });
}

async function abrir(nome = 'Notificações') {
  await userEvent.click(await screen.findByRole('button', { name: nome }));
}

describe('MenuAlertas (central de notificações)', () => {
  it('mostra o contador de não lidos e os alertas do dia', async () => {
    renderApp('/', api());
    expect(await screen.findByLabelText('2 notificações não lidas')).toBeInTheDocument();

    await abrir();
    expect(await screen.findByText('1 conta a pagar vence hoje')).toBeInTheDocument();
    expect(screen.getByText('2 contas a pagar vencidas')).toBeInTheDocument();
  });

  it('clicar no alerta abre a lista já filtrada e marca como lido', async () => {
    const fetchMock = api();
    const { router } = renderApp('/', fetchMock);
    await screen.findByLabelText('2 notificações não lidas');
    await userEvent.click(screen.getByRole('button', { name: /^Notificações/ }));

    await userEvent.click(await screen.findByText('1 conta a pagar vence hoje'));

    await waitFor(() =>
      expect(router.state.location.search).toBe(
        '?status=PENDENTE&vencimentoDe=2026-11-25&vencimentoAte=2026-11-25',
      ),
    );
    expect(router.state.location.pathname).toBe('/pagar');
    await waitFor(() =>
      expect(chamadasPara(fetchMock, `${URL_ALERTAS}/${ID_VENCENDO}/lido`)).toHaveLength(1),
    );
    expect(chamadasPara(fetchMock, `${URL_ALERTAS}/${ID_VENCENDO}/lido`)[0]?.[1]?.method).toBe(
      'PATCH',
    );
  });

  it('marca como resolvida pelo botão do alerta', async () => {
    const fetchMock = api();
    renderApp('/', fetchMock);
    await screen.findByLabelText('2 notificações não lidas');
    await userEvent.click(screen.getByRole('button', { name: /^Notificações/ }));

    const botoes = await screen.findAllByRole('button', { name: 'Marcar como resolvida' });
    await userEvent.click(botoes[1]!);

    await waitFor(() =>
      expect(chamadasPara(fetchMock, `${URL_ALERTAS}/${ID_VENCIDAS}/resolvido`)).toHaveLength(1),
    );
  });

  it('"Mostrar resolvidos" pede os resolvidos à API', async () => {
    const fetchMock = api();
    renderApp('/', fetchMock);
    await screen.findByLabelText('2 notificações não lidas');
    await userEvent.click(screen.getByRole('button', { name: /^Notificações/ }));

    await userEvent.click(await screen.findByRole('menuitem', { name: 'Mostrar resolvidos' }));

    await waitFor(() =>
      expect(
        chamadasPara(fetchMock, URL_ALERTAS).some(([url]) =>
          url.includes('incluirResolvidos=true'),
        ),
      ).toBe(true),
    );
    expect(await screen.findByRole('menuitem', { name: 'Ocultar resolvidos' })).toBeInTheDocument();
  });

  it('sem alertas mostra "Nenhuma notificação" e sem contador', async () => {
    renderApp('/', api([]));
    await userEvent.click(await screen.findByRole('button', { name: 'Notificações' }));
    expect(await screen.findByText('Nenhuma notificação')).toBeInTheDocument();
  });

  it('em inglês traduz o botão, os textos e o plural', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' as const },
    };
    renderApp('/', api([VENCENDO, alerta({})], usuario));
    await screen.findByLabelText('2 unread notifications');
    await userEvent.click(screen.getByRole('button', { name: /^Notifications/ }));

    expect(await screen.findByText('1 bill is due today')).toBeInTheDocument();
    expect(screen.getByText('2 overdue bills')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Mark as resolved' })).toHaveLength(2);
  });

  it('sem acesso ao Painel não consulta a API de alertas', async () => {
    const usuario = { ...USUARIO_TESTE, permissoes: ['financeiro.contas-pagar.ver' as const] };
    const fetchMock = api([VENCENDO], usuario);
    renderApp('/', fetchMock);
    await screen.findByRole('button', { name: 'Menu do usuário' });
    expect(chamadasPara(fetchMock, URL_ALERTAS)).toHaveLength(0);
  });
});
