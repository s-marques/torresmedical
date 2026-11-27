import { PERMISSOES, type CobrancaEnviada, type ContaReceber } from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

const API = '/api/financeiro/contas-receber';
const COBRANCAS = '/api/financeiro/inadimplencia/cobrancas';
const ID_CONTA = '00000000-0000-4000-8000-0000000000d1';
const ID_PROFISSIONAL = '00000000-0000-4000-8000-0000000000e1';

function conta(parcial: Partial<ContaReceber> = {}): ContaReceber {
  return {
    id: ID_CONTA,
    numero: 7,
    descricao: 'Aluguel Sala 7',
    pacienteId: null,
    pacienteNome: null,
    profissionalSacadoId: ID_PROFISSIONAL,
    profissionalSacadoNome: 'Dr. Locatário',
    contratoSalaId: null,
    contratoSalaNumero: null,
    renegociadoDeId: null,
    renegociadoDeNumero: null,
    renegociadoParaNumeros: [],
    competencia: null,
    valor: '1500.00',
    valorRecebido: '0.00',
    saldo: '1500.00',
    dataVencimento: '2026-11-20',
    formaPagamentoId: null,
    formaPagamentoNome: null,
    planoContaId: null,
    planoContaNome: null,
    documento: null,
    totalParcelas: 1,
    status: 'PENDENTE',
    contaBancariaId: null,
    contaBancariaNome: null,
    dataRecebimento: null,
    observacoes: null,
    createdAt: '2026-10-14T12:00:00.000Z',
    updatedAt: '2026-10-14T12:00:00.000Z',
    ...parcial,
  };
}

const ENVIOS: CobrancaEnviada[] = [
  {
    id: '00000000-0000-4000-8000-0000000000f1',
    contaReceberId: ID_CONTA,
    contaReceberNumero: 7,
    profissionalNome: 'Dr. Locatário',
    marco: 'ANTES_3_DIAS',
    canal: 'WHATSAPP',
    status: 'ENVIADO',
    erro: null,
    vencimento: '2026-11-20',
    createdAt: '2026-11-17T11:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-0000000000f2',
    contaReceberId: ID_CONTA,
    contaReceberNumero: 7,
    profissionalNome: 'Dr. Locatário',
    marco: 'NO_VENCIMENTO',
    canal: 'WHATSAPP',
    status: 'FALHA',
    erro: 'SEM_CANAL',
    vencimento: '2026-11-20',
    createdAt: '2026-11-20T11:00:00.000Z',
  },
];

function api(contas: ContaReceber[], envios: CobrancaEnviada[], usuario = USUARIO_TESTE) {
  return apiFalsa({
    usuario,
    rotas: {
      [API]: () =>
        json({
          data: contas,
          meta: { page: 1, pageSize: 10, total: contas.length, totalPages: 1 },
        }),
      [`${API}/${ID_CONTA}/baixas`]: () => json([]),
      [COBRANCAS]: () =>
        json({
          data: envios,
          meta: { page: 1, pageSize: 50, total: envios.length, totalPages: 1 },
        }),
    },
  });
}

async function abrirDetalhe(fetchMock: ReturnType<typeof api>) {
  const user = userEvent.setup();
  renderApp('/receber', fetchMock);
  const linha = (await screen.findByText('Aluguel Sala 7')).closest('tr') as HTMLElement;
  await user.click(within(linha).getByRole('button', { name: 'Ações' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Detalhar' }));
  return screen.findByRole('dialog', { name: 'Aluguel Sala 7' });
}

describe('Detalhe da conta a receber: cobranças da régua (#166)', { timeout: 20_000 }, () => {
  it('lista as cobranças enviadas ao profissional, com marco, situação e motivo da falha', async () => {
    const modal = await abrirDetalhe(api([conta()], ENVIOS));

    expect(await within(modal).findByText('Cobranças enviadas')).toBeVisible();
    expect(within(modal).getByText('3 dias antes do vencimento')).toBeVisible();
    expect(within(modal).getByText('Enviada')).toBeVisible();
    expect(within(modal).getByText('No vencimento')).toBeVisible();
    expect(within(modal).getByText('Falha')).toBeVisible();
    expect(within(modal).getByText('Sem canal de WhatsApp conectado')).toBeVisible();
  });

  it('título nunca cobrado não mostra a seção', async () => {
    const fetchMock = api([conta()], []);
    const modal = await abrirDetalhe(fetchMock);

    await waitFor(() => expect(chamadasPara(fetchMock, COBRANCAS)).toHaveLength(1));
    expect(within(modal).queryByText('Cobranças enviadas')).toBeNull();
  });

  it('título de paciente (sem profissional sacado) nem consulta a régua', async () => {
    const fetchMock = api(
      [conta({ profissionalSacadoId: null, profissionalSacadoNome: null })],
      ENVIOS,
    );
    const modal = await abrirDetalhe(fetchMock);

    expect(await within(modal).findByText('Aluguel Sala 7')).toBeVisible();
    expect(chamadasPara(fetchMock, COBRANCAS)).toHaveLength(0);
  });

  it('sem a permissão de Inadimplência não consulta nem mostra as cobranças', async () => {
    const usuario = {
      ...USUARIO_TESTE,
      permissoes: PERMISSOES.filter((p) => p.startsWith('financeiro.contas-receber.')),
    };
    const fetchMock = api([conta()], ENVIOS, usuario);
    const modal = await abrirDetalhe(fetchMock);

    expect(await within(modal).findByText('Aluguel Sala 7')).toBeVisible();
    expect(within(modal).queryByText('Cobranças enviadas')).toBeNull();
    expect(chamadasPara(fetchMock, COBRANCAS)).toHaveLength(0);
  });
});
