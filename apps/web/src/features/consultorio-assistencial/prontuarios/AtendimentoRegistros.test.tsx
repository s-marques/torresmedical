import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PREFERENCIAS_PADRAO,
  type Atendimento,
  type AtendimentoAnexo,
  type AtendimentoDocumento,
  type AtendimentoVersao,
  type PacienteResumoProntuario,
  type Prontuario,
} from '@torres/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aplicarIdioma } from '@/lib/i18n';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

vi.setConfig({ testTimeout: 30_000 });

const API = '/api/consultorio-assistencial/prontuarios';
const ID_PACIENTE = '00000000-0000-4000-8000-0000000000b1';
const ID_ATENDIMENTO = '00000000-0000-4000-8000-0000000000c1';
const ID_ANEXO = '00000000-0000-4000-8000-0000000000d1';
const ID_DOCUMENTO = '00000000-0000-4000-8000-0000000000d2';
const ID_ARQUIVO = '00000000-0000-4000-8000-0000000000e1';
const BASE = `${API}/${ID_PACIENTE}/atendimentos/${ID_ATENDIMENTO}`;

const PACIENTE: PacienteResumoProntuario = {
  id: ID_PACIENTE,
  nome: 'Paciente Fictício',
  email: null,
  documento: null,
  telefone: null,
  celular: null,
  dataNascimento: null,
  sexo: null,
};

const PRONTUARIO: Prontuario = {
  pacienteId: ID_PACIENTE,
  alergias: null,
  medicamentosEmUso: null,
  doencasCronicas: null,
  cirurgiasAnteriores: null,
  historicoFamiliar: null,
  observacoes: null,
  createdAt: null,
  updatedAt: null,
};

function atendimento(parcial: Partial<Atendimento> = {}): Atendimento {
  return {
    id: ID_ATENDIMENTO,
    pacienteId: ID_PACIENTE,
    profissionalId: '00000000-0000-4000-8000-0000000000a1',
    profissionalNome: 'Dra. Ana Teste',
    tipo: 'CONSULTA',
    queixa: 'Dor de cabeça',
    evolucao: null,
    diagnostico: null,
    conduta: 'Repouso',
    observacoes: null,
    status: 'EM_ANDAMENTO',
    modelo: null,
    respostas: null,
    assinadoEm: null,
    assinadoPorNome: null,
    totalAdendos: 0,
    createdAt: '2026-11-20T10:00:00.000Z',
    updatedAt: '2026-11-20T10:00:00.000Z',
    ...parcial,
  };
}

const ASSINADO = atendimento({
  status: 'FINALIZADO',
  assinadoEm: '2026-11-21T10:00:00.000Z',
  assinadoPorNome: 'Dra. Ana Teste',
  totalAdendos: 1,
});

const ANEXO: AtendimentoAnexo = {
  id: ID_ANEXO,
  atendimentoId: ID_ATENDIMENTO,
  tipo: 'EXAME',
  arquivoId: ID_ARQUIVO,
  arquivoNome: 'hemograma.pdf',
  data: '2026-11-19',
  descricao: 'Hemograma completo',
  criadoPorNome: 'Dra. Ana Teste',
  createdAt: '2026-11-20T10:00:00.000Z',
};

const DOCUMENTO: AtendimentoDocumento = {
  id: ID_DOCUMENTO,
  atendimentoId: ID_ATENDIMENTO,
  tipo: 'ATESTADO',
  texto: 'Atesto repouso por 2 dias.',
  dataEmissao: '2026-11-20',
  criadoPorNome: 'Dra. Ana Teste',
  createdAt: '2026-11-20T10:00:00.000Z',
};

const SNAPSHOT = {
  tipo: 'CONSULTA',
  queixa: 'Dor de cabeça',
  evolucao: null,
  diagnostico: null,
  conduta: 'Repouso',
  observacoes: null,
  adendos: [],
};

const VERSOES: AtendimentoVersao[] = [
  {
    id: '00000000-0000-4000-8000-0000000000f1',
    atendimentoId: ID_ATENDIMENTO,
    numero: 1,
    tipo: 'ASSINATURA',
    usuarioId: 'u1',
    usuarioNome: 'Dra. Ana Teste',
    texto: null,
    antes: null,
    depois: SNAPSHOT,
    hash: 'a'.repeat(64),
    createdAt: '2026-11-21T10:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-0000000000f2',
    atendimentoId: ID_ATENDIMENTO,
    numero: 2,
    tipo: 'ADENDO',
    usuarioId: 'u1',
    usuarioNome: 'Dra. Ana Teste',
    texto: 'Dose corrigida para 500 mg.',
    antes: SNAPSHOT,
    depois: { ...SNAPSHOT, adendos: ['Dose corrigida para 500 mg.'] },
    hash: 'b'.repeat(64),
    createdAt: '2026-11-22T10:00:00.000Z',
  },
];

const corpoDe = (init?: RequestInit) => JSON.parse(String(init?.body)) as Record<string, unknown>;
const ehLeitura = (init?: RequestInit) => !init?.method || init.method === 'GET';

function pagina<T>(data: T[]) {
  return json({ data, meta: { page: 1, pageSize: 100, total: data.length, totalPages: 1 } });
}

type Rotas = NonNullable<NonNullable<Parameters<typeof apiFalsa>[0]>['rotas']>;

function api(registro: Atendimento, rotas: Rotas = {}, idioma?: 'en') {
  return apiFalsa({
    usuario: idioma
      ? { ...USUARIO_TESTE, preferencias: { ...PREFERENCIAS_PADRAO, idioma } }
      : USUARIO_TESTE,
    rotas: {
      [API]: () =>
        pagina([{ ...PACIENTE, totalRegistros: 1, ultimoRegistro: '2026-11-20T10:00:00.000Z' }]),
      [`${API}/${ID_PACIENTE}/paciente`]: () => json(PACIENTE),
      [`${API}/${ID_PACIENTE}`]: () => json(PRONTUARIO),
      [`${API}/${ID_PACIENTE}/atendimentos`]: () => pagina([registro]),
      [`${BASE}/anexos`]: () => json({ data: [ANEXO] }),
      [`${BASE}/documentos`]: () => json({ data: [DOCUMENTO] }),
      [`${BASE}/versoes`]: () => json({ data: VERSOES }),
      ...rotas,
    },
  });
}

async function abrirDetalhe(fetchMock: ReturnType<typeof api>) {
  const user = userEvent.setup();
  renderApp('/prontuarios', fetchMock);
  await user.click(await screen.findByText('Paciente Fictício'));
  await user.click(await screen.findByRole('tab', { name: 'Atendimentos' }));
  await user.click(await screen.findByRole('button', { name: 'Detalhes' }));
  const dialogo = await screen.findByRole('dialog', { name: 'Atendimento' });
  return { user, dialogo };
}

afterEach(() => {
  aplicarIdioma('pt-BR');
  vi.unstubAllGlobals();
});

describe('Atendimento: exames, anexos, documentos, assinatura e versões (#151)', () => {
  it('não assinado: mostra editar e assinar, sem adendo nem histórico de versões', async () => {
    const { dialogo } = await abrirDetalhe(api(atendimento()));

    expect(within(dialogo).getByText(/Atendimento não assinado/)).toBeVisible();
    expect(within(dialogo).getByRole('button', { name: 'Editar' })).toBeVisible();
    expect(within(dialogo).getByRole('button', { name: 'Assinar' })).toBeVisible();
    expect(within(dialogo).queryByRole('button', { name: 'Registrar adendo' })).toBeNull();
    expect(within(dialogo).queryByText('Histórico de versões')).toBeNull();
    expect(await within(dialogo).findByText('hemograma.pdf')).toBeVisible();
    expect(await within(dialogo).findByText('Atesto repouso por 2 dias.')).toBeVisible();
  });

  it('assinar exige a senha e envia a confirmação', async () => {
    let corpo: Record<string, unknown> = {};
    const fetchMock = api(atendimento(), {
      [`${BASE}/assinatura`]: (init) => {
        corpo = corpoDe(init);
        return json(ASSINADO);
      },
    });
    const { user, dialogo } = await abrirDetalhe(fetchMock);

    await user.click(within(dialogo).getByRole('button', { name: 'Assinar' }));
    const modal = await screen.findByRole('dialog', { name: 'Assinar atendimento' });
    await user.click(within(modal).getByRole('button', { name: 'Assinar' }));
    expect(await within(modal).findByText('Informe a senha para assinar.')).toBeVisible();

    await user.type(within(modal).getByLabelText(/Senha/), 'senha-de-teste-1');
    await user.click(within(modal).getByRole('button', { name: 'Assinar' }));

    await waitFor(() => expect(corpo).toEqual({ senha: 'senha-de-teste-1' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Assinar atendimento' })).toBeNull(),
    );
    expect(chamadasPara(fetchMock, `${API}/${ID_PACIENTE}/atendimentos`).length).toBeGreaterThan(1);
  });

  it('senha incorreta mostra o erro no formulário e mantém o modal aberto', async () => {
    const fetchMock = api(atendimento(), {
      [`${BASE}/assinatura`]: () =>
        json(
          {
            statusCode: 422,
            code: 'ASSINATURA_SENHA_INVALIDA',
            message: 'Senha incorreta.',
            details: [{ field: 'senha', message: 'Senha incorreta.' }],
          },
          422,
        ),
    });
    const { user, dialogo } = await abrirDetalhe(fetchMock);
    await user.click(within(dialogo).getByRole('button', { name: 'Assinar' }));
    const modal = await screen.findByRole('dialog', { name: 'Assinar atendimento' });
    await user.type(within(modal).getByLabelText(/Senha/), 'errada');
    await user.click(within(modal).getByRole('button', { name: 'Assinar' }));

    expect(await within(modal).findByText('Senha incorreta.')).toBeVisible();
    expect(screen.getByRole('dialog', { name: 'Assinar atendimento' })).toBeVisible();
  });

  it('assinado: sem edição; mostra adendo e o histórico de versões com antes/depois', async () => {
    const { dialogo } = await abrirDetalhe(api(ASSINADO));

    expect(within(dialogo).getByText(/Assinado por Dra. Ana Teste/)).toBeVisible();
    expect(within(dialogo).queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(within(dialogo).queryByRole('button', { name: 'Assinar' })).toBeNull();
    expect(within(dialogo).getByRole('button', { name: 'Registrar adendo' })).toBeVisible();
    expect(within(dialogo).getByText('1 adendo')).toBeVisible();

    expect(await within(dialogo).findByText('Versão 1: Assinatura')).toBeVisible();
    expect(within(dialogo).getByText('Versão 2: Adendo')).toBeVisible();
    expect(within(dialogo).getAllByText('Dose corrigida para 500 mg.').length).toBeGreaterThan(0);
    // Exame e documento do atendimento assinado não podem ser excluídos.
    await within(dialogo).findByText('hemograma.pdf');
    expect(within(dialogo).queryByRole('button', { name: /Excluir hemograma/ })).toBeNull();
  });

  it('adendo: exige o texto e cria a nova versão', async () => {
    let corpo: Record<string, unknown> = {};
    const fetchMock = api(ASSINADO, {
      [`${BASE}/adendos`]: (init) => {
        corpo = corpoDe(init);
        return json(VERSOES[1], 201);
      },
    });
    const { user, dialogo } = await abrirDetalhe(fetchMock);

    await user.click(within(dialogo).getByRole('button', { name: 'Registrar adendo' }));
    const modal = await screen.findByRole('dialog', { name: 'Registrar adendo' });
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));
    expect(await within(modal).findByText('Adendo é obrigatório.')).toBeVisible();

    await user.type(within(modal).getByLabelText(/Adendo/), 'Dose corrigida para 500 mg.');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(corpo).toEqual({ texto: 'Dose corrigida para 500 mg.' }));
  });

  it('exame: baixa pelo link temporário e exclui com confirmação (antes de assinar)', async () => {
    const aberto = vi.fn();
    vi.stubGlobal('open', aberto);
    let excluiu = false;
    const fetchMock = api(atendimento(), {
      [`${BASE}/anexos/${ID_ANEXO}/link`]: () =>
        json({
          url: '/api/arquivos/x/conteudo?expira=1&assinatura=y',
          expiraEm: '2026-11-24T12:00:00.000Z',
        }),
      [`${BASE}/anexos/${ID_ANEXO}`]: (init) => {
        if (init?.method === 'DELETE') excluiu = true;
        return json(ANEXO);
      },
    });
    const { user, dialogo } = await abrirDetalhe(fetchMock);

    await user.click(await within(dialogo).findByRole('button', { name: /Baixar hemograma/ }));
    await waitFor(() =>
      expect(aberto).toHaveBeenCalledWith(
        '/api/arquivos/x/conteudo?expira=1&assinatura=y',
        '_blank',
        'noopener,noreferrer',
      ),
    );

    await user.click(within(dialogo).getByRole('button', { name: /Excluir hemograma/ }));
    const confirmacao = await screen.findByRole('alertdialog');
    await user.click(within(confirmacao).getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(excluiu).toBe(true));
  });

  it('documento: exige o texto e emite o atestado', async () => {
    let corpo: Record<string, unknown> = {};
    const fetchMock = api(atendimento(), {
      [`${BASE}/documentos`]: (init) => {
        if (ehLeitura(init)) return json({ data: [DOCUMENTO] });
        corpo = corpoDe(init);
        return json(DOCUMENTO, 201);
      },
    });
    const { user, dialogo } = await abrirDetalhe(fetchMock);

    await user.click(await within(dialogo).findByRole('button', { name: 'Emitir documento' }));
    const modal = await screen.findByRole('dialog', { name: 'Emitir documento' });
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));
    expect(await within(modal).findByText('Texto é obrigatório.')).toBeVisible();

    await user.type(within(modal).getByLabelText(/Texto/), 'Atesto repouso por 2 dias.');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(corpo).toMatchObject({ tipo: 'ATESTADO', texto: 'Atesto repouso por 2 dias.' }),
    );
  });

  it('exame: exige o arquivo antes de salvar', async () => {
    const { user, dialogo } = await abrirDetalhe(api(atendimento()));
    await user.click(await within(dialogo).findByRole('button', { name: 'Novo exame ou anexo' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo exame ou anexo' });
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));
    expect(await within(modal).findByText('Envie o arquivo.')).toBeVisible();
  });

  it('editar: envia só o PATCH do atendimento não assinado', async () => {
    let corpo: Record<string, unknown> = {};
    const fetchMock = api(atendimento(), {
      [BASE]: (init) => {
        corpo = corpoDe(init);
        return json(atendimento({ queixa: 'Nova queixa' }));
      },
    });
    const { user, dialogo } = await abrirDetalhe(fetchMock);

    await user.click(within(dialogo).getByRole('button', { name: 'Editar' }));
    const modal = await screen.findByRole('dialog', { name: 'Editar atendimento' });
    const queixa = within(modal).getByLabelText('Queixa');
    await user.clear(queixa);
    await user.type(queixa, 'Nova queixa');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(corpo).toMatchObject({ queixa: 'Nova queixa', conduta: 'Repouso' }));
  });

  it('em inglês, os textos do detalhe são traduzidos', async () => {
    const user = userEvent.setup();
    renderApp('/prontuarios', api(ASSINADO, {}, 'en'));
    await user.click(await screen.findByText('Paciente Fictício'));
    await user.click(await screen.findByRole('tab', { name: 'Atendimentos' }));
    await user.click(await screen.findByRole('button', { name: 'Details' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Appointment' });

    expect(within(dialogo).getByText(/Signed by Dra. Ana Teste/)).toBeVisible();
    expect(within(dialogo).getByRole('button', { name: 'Add addendum' })).toBeVisible();
    expect(await within(dialogo).findByText('Exams and attachments')).toBeVisible();
    expect(within(dialogo).getByText('Issued documents')).toBeVisible();
    expect(await within(dialogo).findByText('Version 2: Addendum')).toBeVisible();
  });
});
