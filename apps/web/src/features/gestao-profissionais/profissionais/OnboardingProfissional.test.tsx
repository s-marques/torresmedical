import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ONBOARDING_ETAPAS,
  PERMISSOES,
  PREFERENCIAS_PADRAO,
  type Onboarding,
  type OnboardingEtapa,
  type UsuarioSessao,
} from '@torres/shared';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/providers/AppProviders';
import { entrar } from '@/lib/auth/sessao';
import { apiFalsa, chamadasPara, json, sessaoJson, USUARIO_TESTE } from '@/test/render-app';
import { OnboardingProfissional } from './OnboardingProfissional';

vi.setConfig({ testTimeout: 20_000 });

const PROF = '00000000-0000-4000-8000-0000000000a1';
const ONB = '00000000-0000-4000-8000-0000000000b1';
const CONTRATO = '00000000-0000-4000-8000-0000000000c1';
const USUARIO = '00000000-0000-4000-8000-0000000000d1';
const URL = `/api/gestao-profissionais/profissionais/${PROF}/onboarding`;
const URL_RECEPCAO = `/api/gestao-profissionais/onboarding/${ONB}/recepcao`;

function onboarding(
  concluidas: OnboardingEtapa[],
  extra: Partial<Onboarding> = {},
  atrasadas: OnboardingEtapa[] = [],
): Onboarding {
  const orientada = concluidas.includes('RECEPCAO_ORIENTADA');
  return {
    id: ONB,
    profissionalId: PROF,
    profissionalNome: 'Dra. Ana Fictícia',
    contratoSalaId: CONTRATO,
    salaNome: 'Sala 1',
    iniciadoEm: '2026-11-10',
    diasEmAndamento: 14,
    etapas: ONBOARDING_ETAPAS.map((etapa) => ({
      etapa,
      concluida: concluidas.includes(etapa),
      automatica: etapa !== 'RECEPCAO_ORIENTADA',
      concluidaEm: etapa === 'RECEPCAO_ORIENTADA' && orientada ? '2026-11-23T12:00:00.000Z' : null,
      concluidaPorId: etapa === 'RECEPCAO_ORIENTADA' && orientada ? USUARIO : null,
      concluidaPorNome: etapa === 'RECEPCAO_ORIENTADA' && orientada ? 'Maria Fictícia' : null,
      atrasada: atrasadas.includes(etapa),
      pendencias:
        etapa === 'DOCUMENTACAO_VALIDADA' && !concluidas.includes(etapa)
          ? ['CONTRATO', 'LICENCA']
          : [],
    })),
    concluidas: concluidas.length,
    total: 9,
    completo: false,
    atrasada: atrasadas.length > 0,
    podeAtivar: false,
    sugestoes: { horarios: [], criarUsuario: false },
    ...extra,
  };
}

async function renderSecao(
  rotas: NonNullable<Parameters<typeof apiFalsa>[0]>['rotas'] = {},
  usuario: UsuarioSessao = USUARIO_TESTE,
) {
  const fetchMock = apiFalsa({
    usuario,
    rotas: { '/api/auth/login': () => sessaoJson(usuario), ...rotas },
  });
  vi.stubGlobal('fetch', fetchMock);
  await entrar({ email: 'pessoa@example.com', senha: 'x' });
  const router = createMemoryRouter(
    [{ path: '/', element: <OnboardingProfissional profissionalId={PROF} /> }],
    { initialEntries: ['/'] },
  );
  render(
    <AppProviders onUnauthorized={vi.fn()}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { fetchMock, user: userEvent.setup() };
}

describe('Onboarding no detalhe do profissional', () => {
  it('não mostra a seção para quem não passou por contrato assinado', async () => {
    const { fetchMock } = await renderSecao({ [URL]: () => json({ onboarding: null }) });

    await waitFor(() => expect(chamadasPara(fetchMock, URL)).toHaveLength(1));
    expect(screen.queryByRole('heading', { name: 'Onboarding' })).not.toBeInTheDocument();
  });

  it('mostra as 9 etapas, o resumo e o que falta na documentação', async () => {
    await renderSecao({
      [URL]: () => json({ onboarding: onboarding(['CONTRATO_ASSINADO', 'SALA_DEFINIDA']) }),
    });

    expect(await screen.findByRole('heading', { name: 'Onboarding' })).toBeVisible();
    expect(screen.getAllByRole('listitem')).toHaveLength(9);
    expect(
      screen.getByText(/2 de 9 etapas · contrato assinado em 10\/11\/2026 \(14 dia\(s\)\)/),
    ).toBeVisible();
    const documentacao = screen.getByText('Documentação validada').closest('li') as HTMLElement;
    expect(within(documentacao).getByText('Falta: Contrato, Licença')).toBeVisible();
    expect(within(documentacao).getByText('Pendente')).toBeInTheDocument();
    const contrato = screen.getByText('Contrato assinado').closest('li') as HTMLElement;
    expect(within(contrato).getByText('Concluída')).toBeInTheDocument();
  });

  it('destaca a etapa atrasada', async () => {
    await renderSecao({
      [URL]: () =>
        json({
          onboarding: onboarding(['CONTRATO_ASSINADO'], { atrasada: true }, ['ACESSO_CRIADO']),
        }),
    });

    const acesso = (await screen.findByText('Acesso ao sistema criado')).closest(
      'li',
    ) as HTMLElement;
    expect(within(acesso).getByText('Atrasada')).toBeVisible();
    const contrato = screen.getByText('Contrato assinado').closest('li') as HTMLElement;
    expect(within(contrato).queryByText('Atrasada')).not.toBeInTheDocument();
  });

  it('recepção orientada mostra quem marcou e quando, e permite desmarcar', async () => {
    const corpos: unknown[] = [];
    const { user, fetchMock } = await renderSecao({
      [URL]: () => json({ onboarding: onboarding(['CONTRATO_ASSINADO', 'RECEPCAO_ORIENTADA']) }),
      [URL_RECEPCAO]: (init) => {
        corpos.push(JSON.parse(String(init?.body)));
        return json(onboarding(['CONTRATO_ASSINADO']));
      },
    });

    expect(await screen.findByText(/Marcada por Maria Fictícia em/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Desmarcar' }));

    await waitFor(() => expect(corpos).toEqual([{ orientada: false }]));
    await waitFor(() => expect(chamadasPara(fetchMock, URL).length).toBeGreaterThan(1));
  });

  it('marcar a recepção como orientada envia true', async () => {
    const corpos: unknown[] = [];
    const { user } = await renderSecao({
      [URL]: () => json({ onboarding: onboarding(['CONTRATO_ASSINADO']) }),
      [URL_RECEPCAO]: (init) => {
        corpos.push(JSON.parse(String(init?.body)));
        return json(onboarding(['CONTRATO_ASSINADO', 'RECEPCAO_ORIENTADA']));
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Marcar como orientada' }));

    await waitFor(() => expect(corpos).toEqual([{ orientada: true }]));
  });

  it('sem permissão de editar o onboarding não há botão de marcar', async () => {
    await renderSecao(
      { [URL]: () => json({ onboarding: onboarding(['CONTRATO_ASSINADO']) }) },
      {
        ...USUARIO_TESTE,
        permissoes: PERMISSOES.filter((p) => p !== 'gestao-profissionais.onboarding.editar'),
      },
    );

    await screen.findByText('Recepção orientada');
    expect(screen.queryByRole('button', { name: 'Marcar como orientada' })).not.toBeInTheDocument();
  });

  it('sugere o horário do contrato e a criação do usuário, com link para Usuários', async () => {
    await renderSecao({
      [URL]: () =>
        json({
          onboarding: onboarding(['CONTRATO_ASSINADO'], {
            sugestoes: {
              horarios: [{ diaSemana: 2, inicio: '08:00', fim: '12:00' }],
              criarUsuario: true,
            },
          }),
        }),
    });

    expect(await screen.findByText(/Ter 08:00-12:00/)).toBeVisible();
    expect(screen.getByText(/criar o usuário vinculado ao profissional/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Abrir Usuários' })).toHaveAttribute(
      'href',
      '/usuarios',
    );
    expect(
      screen.getByText(/só pode ser ativado com todas as etapas, exceto "Profissional ativo"/),
    ).toBeVisible();
  });

  it('erro da API mostra a mensagem de falha', async () => {
    await renderSecao({
      [URL]: () => json({ statusCode: 500, code: 'ERRO', message: 'Falha' }, 500),
    });

    expect(await screen.findByText('Não foi possível carregar o onboarding.')).toBeVisible();
  });

  it('em espanhol, traduz as etapas e a ação', async () => {
    await renderSecao(
      { [URL]: () => json({ onboarding: onboarding(['CONTRATO_ASSINADO']) }) },
      { ...USUARIO_TESTE, preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'es' } },
    );

    expect(await screen.findByText('Recepción orientada')).toBeVisible();
    expect(screen.getByText('Primera atención')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Marcar como orientada' })).toBeVisible();
  });
});
