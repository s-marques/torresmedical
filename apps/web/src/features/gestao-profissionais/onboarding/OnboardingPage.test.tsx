import {
  ONBOARDING_ETAPAS,
  PERMISSOES,
  PREFERENCIAS_PADRAO,
  type Onboarding,
  type OnboardingEtapa,
} from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/gestao-profissionais/onboarding';
const PROF_1 = '00000000-0000-4000-8000-0000000000a1';
const PROF_2 = '00000000-0000-4000-8000-0000000000a2';
const ONB_1 = '00000000-0000-4000-8000-0000000000b1';
const ONB_2 = '00000000-0000-4000-8000-0000000000b2';
const CONTRATO = '00000000-0000-4000-8000-0000000000c1';

function onboarding(
  parcial: Partial<Onboarding> & { concluidas?: OnboardingEtapa[] } = {},
): Onboarding {
  const { concluidas = ['CONTRATO_ASSINADO', 'SALA_DEFINIDA'], ...resto } = parcial;
  const etapas = ONBOARDING_ETAPAS.map((etapa) => ({
    etapa,
    concluida: concluidas.includes(etapa),
    automatica: etapa !== 'RECEPCAO_ORIENTADA',
    concluidaEm: null,
    concluidaPorId: null,
    concluidaPorNome: null,
    atrasada: false,
    pendencias: etapa === 'CADASTRO_COMPLETO' ? ['cpf', 'cnpj'] : [],
  }));
  return {
    id: ONB_1,
    profissionalId: PROF_1,
    profissionalNome: 'Dra. Ana Fictícia',
    contratoSalaId: CONTRATO,
    salaNome: 'Sala 1',
    iniciadoEm: '2026-11-20',
    diasEmAndamento: 4,
    etapas,
    concluidas: concluidas.length,
    total: 9,
    completo: false,
    atrasada: false,
    podeAtivar: false,
    sugestoes: { horarios: [{ diaSemana: 2, inicio: '08:00', fim: '12:00' }], criarUsuario: true },
    ...resto,
  };
}

const EM_DIA = onboarding({});
const ATRASADO = onboarding({
  id: ONB_2,
  profissionalId: PROF_2,
  profissionalNome: 'Dr. Beto Fictício',
  salaNome: 'Sala 2',
  iniciadoEm: '2026-11-10',
  diasEmAndamento: 14,
  atrasada: true,
  concluidas: ['CONTRATO_ASSINADO'],
});

function pagina(data: Onboarding[]) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
}

function renderTela(
  opcoes: {
    permissoes?: readonly string[];
    lista?: (url: string) => Onboarding[];
    idioma?: 'en' | 'es';
    put?: (init?: RequestInit) => Response;
  } = {},
) {
  const lista = opcoes.lista ?? (() => [EM_DIA, ATRASADO]);
  const fetchMock = apiFalsa({
    usuario: {
      ...USUARIO_TESTE,
      permissoes: [...(opcoes.permissoes ?? PERMISSOES)] as typeof USUARIO_TESTE.permissoes,
      preferencias: { ...PREFERENCIAS_PADRAO, ...(opcoes.idioma ? { idioma: opcoes.idioma } : {}) },
    },
    rotas: {
      [API]: (_init, url) => pagina(lista(url)),
      [`/api/gestao-profissionais/profissionais/${PROF_1}/onboarding`]: () =>
        json({ onboarding: EM_DIA }),
      [`${API}/${ONB_1}/recepcao`]: (init) =>
        opcoes.put?.(init) ?? json({ ...EM_DIA, concluidas: 3 }),
    },
  });
  return { user: userEvent.setup(), ...renderApp('/onboarding', fetchMock) };
}

const linha = (nome: string) => screen.getByText(nome).closest('tr') as HTMLElement;

describe('Onboarding em andamento', () => {
  it('lista os profissionais com progresso, próxima etapa e situação', async () => {
    renderTela();

    expect(await screen.findByRole('heading', { name: 'Onboarding' })).toBeVisible();
    await screen.findByText('Dra. Ana Fictícia');
    const emDia = linha('Dra. Ana Fictícia');
    expect(within(emDia).getByText('2/9')).toBeVisible();
    expect(within(emDia).getByText('Cadastro completo')).toBeVisible();
    expect(within(emDia).getByText('Em andamento')).toBeVisible();
    expect(within(emDia).getByText('Sala 1')).toBeVisible();
    expect(within(emDia).getByText('20/11/2026')).toBeVisible();

    const atrasado = linha('Dr. Beto Fictício');
    expect(within(atrasado).getByText('Atrasado')).toBeVisible();
    expect(within(atrasado).getByText('1/9')).toBeVisible();
  });

  it('filtra pela situação enviando o parâmetro para a API', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByText('Dra. Ana Fictícia');

    await user.click(screen.getByRole('combobox', { name: /Situação/ }));
    await user.click(await screen.findByRole('option', { name: 'Atrasado' }));

    await waitFor(() =>
      expect(chamadasPara(fetchMock, API).some(([url]) => url.includes('situacao=ATRASADO'))).toBe(
        true,
      ),
    );
  });

  it('ordena por data de assinatura chamando a API com o sort', async () => {
    const { user, fetchMock } = renderTela();
    await screen.findByText('Dra. Ana Fictícia');

    await user.click(screen.getByRole('button', { name: /Assinatura/ }));

    await waitFor(() =>
      expect(chamadasPara(fetchMock, API).some(([url]) => url.includes('sort=iniciadoEm'))).toBe(
        true,
      ),
    );
  });

  it('sem onboardings mostra o estado vazio', async () => {
    renderTela({ lista: () => [] });

    expect(await screen.findByText('Nenhum onboarding em andamento.')).toBeVisible();
  });

  it('abrir as etapas mostra o checklist e marca a recepção orientada', async () => {
    let corpo: unknown;
    const { user, fetchMock } = renderTela({
      put: (init) => {
        corpo = JSON.parse(String(init?.body));
        return json({ ...EM_DIA });
      },
    });

    await user.click(
      await screen.findByRole('button', { name: 'Ver etapas de Dra. Ana Fictícia' }),
    );
    const modal = await screen.findByRole('dialog', { name: 'Onboarding de Dra. Ana Fictícia' });
    expect(within(modal).getAllByRole('listitem')).toHaveLength(9);
    expect(within(modal).getByText(/Falta: CPF, CNPJ/)).toBeVisible();
    expect(within(modal).getByText(/Horário de atendimento sugerido pelo contrato/)).toBeVisible();
    expect(within(modal).getByText(/Ter 08:00-12:00/)).toBeVisible();
    expect(within(modal).getByText(/criar o usuário vinculado/)).toBeVisible();

    await user.click(within(modal).getByRole('button', { name: 'Marcar como orientada' }));

    await waitFor(() => expect(corpo).toEqual({ orientada: true }));
    await waitFor(() =>
      expect(chamadasPara(fetchMock, `${API}/${ONB_1}/recepcao`)).toHaveLength(1),
    );
  });

  it('sem a permissão de editar o botão de marcar a recepção não aparece', async () => {
    const { user } = renderTela({
      permissoes: ['gestao-profissionais.onboarding.ver'],
    });

    await user.click(
      await screen.findByRole('button', { name: 'Ver etapas de Dra. Ana Fictícia' }),
    );

    const modal = await screen.findByRole('dialog', { name: 'Onboarding de Dra. Ana Fictícia' });
    expect(
      within(modal).queryByRole('button', { name: 'Marcar como orientada' }),
    ).not.toBeInTheDocument();
  });

  it('em inglês, traduz a tela, as etapas e os filtros', async () => {
    const { user } = renderTela({ idioma: 'en' });

    expect(await screen.findByRole('heading', { name: 'Onboarding' })).toBeVisible();
    await screen.findByText('Dra. Ana Fictícia');
    const emDia = linha('Dra. Ana Fictícia');
    expect(within(emDia).getByText('In progress')).toBeVisible();
    expect(within(emDia).getByText('Complete profile')).toBeVisible();
    expect(
      screen.getByText('Professionals who signed the contract', { exact: false }),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'View steps of Dra. Ana Fictícia' }));
    const modal = await screen.findByRole('dialog', { name: 'Onboarding of Dra. Ana Fictícia' });
    expect(within(modal).getByText('Reception briefed')).toBeVisible();
    expect(within(modal).getByText(/Missing: CPF, CNPJ/)).toBeVisible();
    expect(within(modal).getByText(/Tue 08:00-12:00/)).toBeVisible();
  });

  it('em espanhol, traduz o título e a situação', async () => {
    renderTela({ idioma: 'es' });

    expect(await screen.findByText('En curso')).toBeVisible();
    expect(screen.getAllByText('Atrasado').length).toBeGreaterThan(0);
  });
});
