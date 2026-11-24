import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PERMISSOES,
  PREFERENCIAS_PADRAO,
  type ProfissionalDocumento,
  type ProfissionalDocumentosResponse,
  type UsuarioSessao,
} from '@torres/shared';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/providers/AppProviders';
import { entrar } from '@/lib/auth/sessao';
import { apiFalsa, chamadasPara, json, sessaoJson, USUARIO_TESTE } from '@/test/render-app';
import { DocumentosProfissional } from './DocumentosProfissional';

vi.setConfig({ testTimeout: 20_000 });

const PROF = '00000000-0000-4000-8000-0000000000b1';
const DOC_1 = '00000000-0000-4000-8000-0000000000d1';
const DOC_2 = '00000000-0000-4000-8000-0000000000d2';
const ARQUIVO = '00000000-0000-4000-8000-0000000000e1';
const URL = `/api/gestao-profissionais/profissionais/${PROF}/documentos`;

function documento(parcial: Partial<ProfissionalDocumento>): ProfissionalDocumento {
  return {
    id: DOC_1,
    profissionalId: PROF,
    tipo: 'REGISTRO_CONSELHO',
    arquivoId: ARQUIVO,
    arquivoNome: 'registro.pdf',
    numero: '12345',
    emissao: '2025-01-10',
    validade: '2027-01-10',
    observacao: null,
    situacao: 'ENVIADO',
    alerta: null,
    diasParaVencer: 400,
    motivoRecusa: null,
    validadoPorId: null,
    validadoPorNome: null,
    validadoEm: null,
    createdAt: '2026-11-01T12:00:00.000Z',
    ...parcial,
  };
}

function lista(parcial: Partial<ProfissionalDocumentosResponse> = {}) {
  return json({
    data: [
      documento({}),
      documento({
        id: DOC_2,
        tipo: 'LICENCA',
        numero: null,
        situacao: 'VENCIDO',
        alerta: 'vencido',
        validade: '2026-10-01',
        diasParaVencer: -54,
        validadoPorId: USUARIO_TESTE.id,
        validadoPorNome: 'Ana Revisora',
        validadoEm: '2026-09-01T12:00:00.000Z',
      }),
    ],
    pendentes: ['CONTRATO'],
    documentacaoValidada: false,
    ...parcial,
  });
}

async function renderSecao(
  rotas: NonNullable<Parameters<typeof apiFalsa>[0]> = {},
  usuario: UsuarioSessao = USUARIO_TESTE,
) {
  const fetchMock = apiFalsa({
    usuario,
    rotas: { '/api/auth/login': () => sessaoJson(usuario), ...rotas.rotas },
  });
  vi.stubGlobal('fetch', fetchMock);
  await entrar({ email: 'pessoa@example.com', senha: 'x' });
  const router = createMemoryRouter(
    [{ path: '/', element: <DocumentosProfissional profissionalId={PROF} /> }],
    { initialEntries: ['/'] },
  );
  render(
    <AppProviders onUnauthorized={vi.fn()}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { fetchMock, user: userEvent.setup() };
}

describe('Documentos do profissional', () => {
  it('lista os documentos com situação, validade, vencido, pendências e quem validou', async () => {
    await renderSecao({ rotas: { [URL]: () => lista() } });

    const registro = (await screen.findByText(/Registro no conselho/)).closest('li') as HTMLElement;
    expect(within(registro).getByText('Enviado')).toBeVisible();
    expect(within(registro).getByText(/Validade: 10\/01\/2027/)).toBeVisible();
    expect(within(registro).getByText(/registro\.pdf/)).toBeVisible();

    const licenca = screen.getByText('Licença').closest('li') as HTMLElement;
    expect(within(licenca).getByText('Vencido')).toBeVisible();
    expect(within(licenca).getByText(/Validado por Ana Revisora/)).toBeVisible();

    const pendentes = screen.getByRole('list', { name: 'Documentos obrigatórios pendentes' });
    expect(within(pendentes).getByText('Contrato')).toBeVisible();
    expect(screen.getByTestId('resumo-documentacao')).toHaveTextContent('Documentação pendente');
  });

  it('mostra "Documentação validada" quando a API informa', async () => {
    await renderSecao({
      rotas: { [URL]: () => lista({ pendentes: [], documentacaoValidada: true }) },
    });
    expect(await screen.findByText('Documentação validada')).toBeVisible();
  });

  it('sem documentos mostra o estado vazio', async () => {
    await renderSecao({
      rotas: { [URL]: () => lista({ data: [], pendentes: [], documentacaoValidada: false }) },
    });
    expect(await screen.findByText('Nenhum documento enviado.')).toBeVisible();
  });

  it('erro da API mostra mensagem de falha', async () => {
    await renderSecao({
      rotas: { [URL]: () => json({ statusCode: 500, code: 'ERRO', message: 'Falha' }, 500) },
    });
    expect(await screen.findByText('Não foi possível carregar os documentos.')).toBeVisible();
  });

  it('valida o documento chamando a API com a decisão', async () => {
    const decisoes: unknown[] = [];
    const { user, fetchMock } = await renderSecao({
      rotas: {
        [URL]: () => lista(),
        [`${URL}/${DOC_1}/validacao`]: (init) => {
          decisoes.push(JSON.parse(String(init?.body)));
          return json(documento({ situacao: 'VALIDADO' }));
        },
      },
    });

    await user.click(
      await screen.findByRole('button', { name: 'Validar Registro no conselho (CRM, CRN…)' }),
    );

    await waitFor(() => expect(decisoes).toEqual([{ decisao: 'VALIDAR' }]));
    // Depois de decidir, a lista é buscada de novo.
    await waitFor(() => expect(chamadasPara(fetchMock, URL).length).toBeGreaterThan(1));
  });

  it('recusar exige o motivo e envia a recusa', async () => {
    const decisoes: unknown[] = [];
    const { user } = await renderSecao({
      rotas: {
        [URL]: () => lista(),
        [`${URL}/${DOC_1}/validacao`]: (init) => {
          decisoes.push(JSON.parse(String(init?.body)));
          return json(documento({ situacao: 'RECUSADO' }));
        },
      },
    });

    await user.click(
      await screen.findByRole('button', { name: 'Recusar Registro no conselho (CRM, CRN…)' }),
    );
    const modal = await screen.findByRole('dialog', { name: 'Recusar' });
    await user.click(within(modal).getByRole('button', { name: 'Recusar documento' }));
    expect(await within(modal).findByText('Motivo é obrigatório.')).toBeVisible();
    expect(decisoes).toHaveLength(0);

    await user.type(within(modal).getByLabelText(/Motivo da recusa/), 'Imagem ilegível');
    await user.click(within(modal).getByRole('button', { name: 'Recusar documento' }));

    await waitFor(() =>
      expect(decisoes).toEqual([{ decisao: 'RECUSAR', motivo: 'Imagem ilegível' }]),
    );
  });

  it('novo documento sem tipo e sem arquivo mostra as mensagens de obrigatório', async () => {
    const { user } = await renderSecao({ rotas: { [URL]: () => lista() } });

    await user.click(await screen.findByRole('button', { name: 'Novo documento' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo documento' });
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    expect(await within(modal).findByText('Tipo é obrigatório.')).toBeVisible();
    expect(within(modal).getByText('Arquivo é obrigatório.')).toBeVisible();
  });

  it('exclui o documento só depois da confirmação', async () => {
    let excluidos = 0;
    const { user } = await renderSecao({
      rotas: {
        [URL]: () => lista(),
        [`${URL}/${DOC_1}`]: (init) => {
          if (init?.method === 'DELETE') excluidos += 1;
          return json(documento({}));
        },
      },
    });

    await user.click(
      await screen.findByRole('button', { name: 'Excluir Registro no conselho (CRM, CRN…)' }),
    );
    expect(excluidos).toBe(0);
    const confirmacao = await screen.findByRole('alertdialog');
    await user.click(within(confirmacao).getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(excluidos).toBe(1));
  });

  it('baixa o documento pelo link temporário da API', async () => {
    const abrir = vi.fn();
    vi.stubGlobal('open', abrir);
    const { user } = await renderSecao({
      rotas: {
        [URL]: () => lista(),
        [`${URL}/${DOC_1}/link`]: () =>
          json({
            url: `/api/arquivos/${ARQUIVO}/conteudo?expira=1&assinatura=x`,
            expiraEm: '2026-11-24T12:05:00.000Z',
          }),
      },
    });

    await user.click(
      await screen.findByRole('button', { name: 'Baixar Registro no conselho (CRM, CRN…)' }),
    );

    await waitFor(() =>
      expect(abrir).toHaveBeenCalledWith(
        `/api/arquivos/${ARQUIVO}/conteudo?expira=1&assinatura=x`,
        '_blank',
        'noopener,noreferrer',
      ),
    );
  });

  it('sem permissão de editar e de validar, só mostra o download', async () => {
    const somenteVer: UsuarioSessao = {
      ...USUARIO_TESTE,
      permissoes: PERMISSOES.filter((p) => p === 'gestao-profissionais.profissionais.ver'),
    };
    await renderSecao({ rotas: { [URL]: () => lista() } }, somenteVer);

    await screen.findByText(/Registro no conselho/);
    expect(screen.getAllByRole('button', { name: /^Baixar/ })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Novo documento' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Validar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Excluir/ })).not.toBeInTheDocument();
  });

  it('em inglês mostra os textos traduzidos', async () => {
    await renderSecao(
      { rotas: { [URL]: () => lista() } },
      { ...USUARIO_TESTE, preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' } },
    );

    expect(await screen.findByRole('heading', { name: 'Documents' })).toBeVisible();
    expect(await screen.findByText(/Council registration/)).toBeVisible();
    expect(screen.getByText('Expired')).toBeVisible();
    expect(screen.getByText('Documentation pending')).toBeVisible();
    expect(screen.getByRole('button', { name: 'New document' })).toBeVisible();
  });
});
