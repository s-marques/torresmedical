import {
  MENSAGEM_PADRAO_MARCO,
  PREFERENCIAS_PADRAO,
  type CobrancaEnviada,
  type PainelInadimplencia,
  type ReguaMarco,
  type TituloInadimplente,
} from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

const API = '/api/financeiro/inadimplencia';
const ID = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;

const PAINEL: PainelInadimplencia = {
  data: '2026-11-26',
  aReceberHoje: { valor: '300.00', quantidade: 1 },
  vencidos: { valor: '950.50', quantidade: 3 },
  aging: [
    { faixa: 'ATE_30', valor: '600.00', quantidade: 1 },
    { faixa: 'DE_31_A_60', valor: '200.00', quantidade: 1 },
    { faixa: 'ACIMA_60', valor: '150.50', quantidade: 1 },
  ],
  contratosInadimplentes: 2,
  profissionaisInadimplentes: 2,
  porProfissional: [
    {
      profissionalId: ID(20),
      nome: 'Dra. Ana Teste',
      valor: '800.00',
      quantidade: 2,
      maiorAtrasoDias: 37,
    },
    {
      profissionalId: ID(21),
      nome: 'Dr. Bruno Teste',
      valor: '150.50',
      quantidade: 1,
      maiorAtrasoDias: 86,
    },
  ],
};

const TITULO: TituloInadimplente = {
  id: ID(30),
  numero: 41,
  descricao: 'Aluguel da sala',
  sacadoTipo: 'PROFISSIONAL',
  sacadoNome: 'Dra. Ana Teste',
  profissionalId: ID(20),
  contratoSalaId: ID(31),
  contratoSalaNumero: 7,
  dataVencimento: '2026-10-20',
  saldo: '600.00',
  diasEmAtraso: 37,
  faixa: 'DE_31_A_60',
  cobrancas: 2,
};

function marco(
  nome: ReguaMarco['marco'],
  dias: number,
  extra: Partial<ReguaMarco> = {},
): ReguaMarco {
  return {
    id: ID(40 + dias + 3),
    marco: nome,
    dias,
    ativo: true,
    enviarWhatsapp: true,
    alertaInterno: true,
    mensagem: MENSAGEM_PADRAO_MARCO[nome],
    updatedAt: '2026-11-26T12:00:00.000Z',
    ...extra,
  };
}

const REGUA = [
  marco('ANTES_3_DIAS', -3),
  marco('NO_VENCIMENTO', 0),
  marco('DEPOIS_3_DIAS', 3),
  marco('DEPOIS_7_DIAS', 7),
];

const ENVIO: CobrancaEnviada = {
  id: ID(50),
  contaReceberId: ID(30),
  contaReceberNumero: 41,
  profissionalNome: 'Dra. Ana Teste',
  marco: 'ANTES_3_DIAS',
  canal: 'WHATSAPP',
  status: 'FALHA',
  erro: 'SEM_TELEFONE',
  vencimento: '2026-11-29',
  createdAt: '2026-11-26T11:00:00.000Z',
};

const pagina = <T,>(data: T[]) =>
  json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
const corpoDe = (init?: RequestInit) => JSON.parse(String(init?.body)) as Record<string, unknown>;

function api(
  rotas: NonNullable<Parameters<typeof apiFalsa>[0]>['rotas'] = {},
  usuario = USUARIO_TESTE,
) {
  return apiFalsa({
    usuario,
    rotas: {
      [`${API}/painel`]: () => json(PAINEL),
      [`${API}/titulos`]: () => pagina([TITULO]),
      [`${API}/regua`]: () => json(REGUA),
      [`${API}/cobrancas`]: () => pagina([ENVIO]),
      ...rotas,
    },
  });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/financeiro/inadimplencia', fetchMock) };
}

describe('Inadimplência (/financeiro/inadimplencia)', { timeout: 20_000 }, () => {
  it('painel: indicadores do dia, aging e inadimplentes batendo com a API', async () => {
    renderTela();

    expect(await screen.findByRole('heading', { name: 'Inadimplência' })).toBeVisible();
    const hoje = await screen.findByTestId('indicador-a-receber-hoje');
    expect(within(hoje).getByText('R$ 300,00')).toBeVisible();
    expect(within(hoje).getByText('1 título')).toBeVisible();
    const vencidos = screen.getByTestId('indicador-vencidos');
    expect(within(vencidos).getByText('R$ 950,50')).toBeVisible();
    expect(within(vencidos).getByText('3 títulos')).toBeVisible();
    expect(within(screen.getByTestId('indicador-contratos')).getByText('2')).toBeVisible();
    expect(within(screen.getByTestId('indicador-profissionais')).getByText('2')).toBeVisible();

    expect(
      within(screen.getByTestId('indicador-aging-ATE_30')).getByText('R$ 600,00'),
    ).toBeVisible();
    expect(
      within(screen.getByTestId('indicador-aging-DE_31_A_60')).getByText('R$ 200,00'),
    ).toBeVisible();
    expect(
      within(screen.getByTestId('indicador-aging-ACIMA_60')).getByText('R$ 150,50'),
    ).toBeVisible();

    expect(screen.getByText('Dra. Ana Teste', { selector: 'span' })).toBeVisible();
    expect(screen.getByText(/atraso de até 86 dia/)).toBeVisible();
  });

  it('lista os títulos vencidos que o painel soma, com atraso e saldo', async () => {
    renderTela();
    const linha = (await screen.findByText('Aluguel da sala')).closest('tr') as HTMLElement;
    expect(within(linha).getByText('41')).toBeVisible();
    expect(within(linha).getByText('#7')).toBeVisible();
    expect(within(linha).getByText('37 dias')).toBeVisible();
    expect(within(linha).getByText('R$ 600,00')).toBeVisible();
    expect(within(linha).getByText('2')).toBeVisible();
  });

  it('filtra os títulos por faixa na consulta à API', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Aluguel da sala');

    await user.click(screen.getByRole('combobox', { name: 'Aging dos vencidos' }));
    await user.click(await screen.findByRole('option', { name: 'Mais de 60 dias' }));

    await waitFor(() => {
      const [url] = chamadasPara(fetchMock, `${API}/titulos`).at(-1) ?? [''];
      expect(new URL(url, 'http://x').searchParams.get('faixa')).toBe('ACIMA_60');
    });
  });

  it('painel vazio mostra a mensagem de nenhum inadimplente', async () => {
    renderTela(
      api({
        [`${API}/painel`]: () =>
          json({
            ...PAINEL,
            vencidos: { valor: '0.00', quantidade: 0 },
            porProfissional: [],
            profissionaisInadimplentes: 0,
            contratosInadimplentes: 0,
          }),
        [`${API}/titulos`]: () => pagina([]),
      }),
    );
    expect(await screen.findByText('Nenhum profissional inadimplente.')).toBeVisible();
    expect(await screen.findByText('Nenhum título vencido.')).toBeVisible();
  });

  it('erro ao carregar o painel mostra o aviso', async () => {
    renderTela(
      api({ [`${API}/painel`]: () => json({ statusCode: 500, code: 'ERRO', message: 'x' }, 500) }),
    );
    expect(
      await screen.findByText('Não foi possível carregar o painel de inadimplência.'),
    ).toBeVisible();
  });

  describe('régua de cobrança', () => {
    async function abrirRegua(fetchMock = api()) {
      const tela = renderTela(fetchMock);
      await tela.user.click(await screen.findByRole('tab', { name: 'Régua de cobrança' }));
      return tela;
    }

    it('mostra os quatro marcos com o texto e as opções', async () => {
      await abrirRegua();
      for (const nome of [
        '3 dias antes do vencimento',
        'No vencimento',
        '3 dias depois do vencimento',
        '7 dias depois do vencimento',
      ]) {
        expect(await screen.findByRole('heading', { name: nome })).toBeVisible();
      }
      const card = screen.getByTestId('marco-ANTES_3_DIAS');
      expect(within(card).getByText(/vence em \{vencimento\}/)).toBeVisible();
      for (const chave of within(card).getAllByRole('switch')) expect(chave).toBeChecked();
    });

    it('desligar um marco envia só o campo alterado', async () => {
      let corpo: Record<string, unknown> | null = null;
      const alvo = REGUA[1]!;
      const { user } = await abrirRegua(
        api({
          [`${API}/regua/${alvo.id}`]: (init) => {
            corpo = corpoDe(init);
            return json({ ...alvo, ativo: false });
          },
        }),
      );
      const card = await screen.findByTestId('marco-NO_VENCIMENTO');
      await user.click(within(card).getByRole('switch', { name: 'Marco ativo (NO_VENCIMENTO)' }));
      await waitFor(() => expect(corpo).toEqual({ ativo: false }));
    });

    it('editar a mensagem: valida o texto e envia o novo', async () => {
      let corpo: Record<string, unknown> | null = null;
      const alvo = REGUA[0]!;
      const { user } = await abrirRegua(
        api({
          [`${API}/regua/${alvo.id}`]: (init) => {
            corpo = corpoDe(init);
            return json({ ...alvo, mensagem: String(corpo.mensagem) });
          },
        }),
      );
      const card = await screen.findByTestId('marco-ANTES_3_DIAS');
      await user.click(within(card).getByRole('button', { name: 'Editar mensagem' }));
      const modal = await screen.findByRole('dialog', {
        name: 'Mensagem: 3 dias antes do vencimento',
      });
      const campo = within(modal).getByLabelText(/Mensagem/);
      expect(campo).toHaveValue(MENSAGEM_PADRAO_MARCO.ANTES_3_DIAS);

      await user.clear(campo);
      await user.click(within(modal).getByRole('button', { name: 'Salvar' }));
      expect(await within(modal).findByText('Mensagem é obrigatória.')).toBeVisible();
      expect(corpo).toBeNull();

      await user.type(campo, 'Oi {{nome}, o título {{titulo} vence em {{vencimento}.');
      await user.click(within(modal).getByRole('button', { name: 'Salvar' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(corpo).toEqual({ mensagem: 'Oi {nome}, o título {titulo} vence em {vencimento}.' });
    });

    it('restaurar texto padrão devolve a sugestão do marco', async () => {
      const { user } = await abrirRegua(
        api({
          [`${API}/regua`]: () =>
            json([marco('ANTES_3_DIAS', -3, { mensagem: 'Texto antigo' }), ...REGUA.slice(1)]),
        }),
      );
      const card = await screen.findByTestId('marco-ANTES_3_DIAS');
      await user.click(within(card).getByRole('button', { name: 'Editar mensagem' }));
      const modal = await screen.findByRole('dialog');
      expect(within(modal).getByLabelText(/Mensagem/)).toHaveValue('Texto antigo');
      await user.click(within(modal).getByRole('button', { name: 'Restaurar texto padrão' }));
      expect(within(modal).getByLabelText(/Mensagem/)).toHaveValue(
        MENSAGEM_PADRAO_MARCO.ANTES_3_DIAS,
      );
    });

    it('sem permissão de editar: opções travadas e sem o botão de editar', async () => {
      const usuario = { ...USUARIO_TESTE, permissoes: ['financeiro.inadimplencia.ver' as const] };
      await abrirRegua(api({}, usuario));
      const card = await screen.findByTestId('marco-ANTES_3_DIAS');
      expect(within(card).queryByRole('button', { name: 'Editar mensagem' })).toBeNull();
      for (const chave of within(card).getAllByRole('switch')) expect(chave).toBeDisabled();
    });
  });

  describe('histórico de cobranças', () => {
    it('lista o envio com marco, situação e motivo da falha', async () => {
      const { user } = renderTela();
      await user.click(await screen.findByRole('tab', { name: 'Histórico de cobranças' }));
      const linha = (await screen.findByText('#41', { selector: 'td *, td' })).closest(
        'tr',
      ) as HTMLElement;
      expect(within(linha).getByText('Dra. Ana Teste')).toBeVisible();
      expect(within(linha).getByText('3 dias antes do vencimento')).toBeVisible();
      expect(within(linha).getByText('Falha')).toBeVisible();
      expect(within(linha).getByText('Profissional sem telefone')).toBeVisible();
    });

    it('filtra por marco na consulta à API', async () => {
      const fetchMock = api();
      const { user } = renderTela(fetchMock);
      await user.click(await screen.findByRole('tab', { name: 'Histórico de cobranças' }));
      await screen.findByText('Profissional sem telefone');

      await user.click(screen.getByRole('combobox', { name: 'Marco' }));
      await user.click(await screen.findByRole('option', { name: 'No vencimento' }));
      await waitFor(() => {
        const [url] = chamadasPara(fetchMock, `${API}/cobrancas`).at(-1) ?? [''];
        expect(new URL(url, 'http://x').searchParams.get('marco')).toBe('NO_VENCIMENTO');
      });
    });
  });

  it('textos em inglês (issue #205)', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' as const },
    };
    const { user } = renderTela(api({}, usuario));

    expect(await screen.findByRole('heading', { name: 'Delinquency' })).toBeVisible();
    expect(await screen.findByText('Receivable today')).toBeVisible();
    expect(screen.getByText('3 invoices')).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Collection schedule' }));
    expect(
      await screen.findByRole('heading', { name: '3 days before the due date' }),
    ).toBeVisible();
  });
});
