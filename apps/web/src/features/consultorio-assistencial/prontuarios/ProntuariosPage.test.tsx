import {
  PREFERENCIAS_PADRAO,
  type Atendimento,
  type PacienteResumoProntuario,
  type Prontuario,
} from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const API = '/api/consultorio-assistencial/prontuarios';
const ID_PACIENTE = '00000000-0000-4000-8000-0000000000b1';
const ID_PROFISSIONAL = '00000000-0000-4000-8000-0000000000a1';

const PACIENTE: PacienteResumoProntuario = {
  id: ID_PACIENTE,
  nome: 'Lucas Zanchet Fernandes',
  email: 'lucas@biologicanet.com.br',
  documento: '03870562110',
  telefone: null,
  celular: '65999979796',
  dataNascimento: '1991-03-06',
  sexo: 'MASCULINO',
};

const PRONTUARIO_VAZIO: Prontuario = {
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

function pagina<T>(data: T[]) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
}

const corpoDe = (init?: RequestInit) => JSON.parse(String(init?.body)) as Record<string, unknown>;
const ehLeitura = (init?: RequestInit) => !init?.method || init.method === 'GET';

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({
    ...rotas,
    rotas: {
      [API]: () =>
        pagina([{ ...PACIENTE, totalRegistros: 1, ultimoRegistro: '2026-10-16T10:00:00.000Z' }]),
      [`${API}/${ID_PACIENTE}/paciente`]: () => json(PACIENTE),
      [`${API}/${ID_PACIENTE}`]: () => json(PRONTUARIO_VAZIO),
      [`${API}/${ID_PACIENTE}/atendimentos`]: () => pagina([]),
      [`${API}/${ID_PACIENTE}/anamneses`]: () => pagina([]),
      [`${API}/${ID_PACIENTE}/historico-clinico`]: () => pagina([]),
      '/api/lookups/pacientes': () =>
        json({
          data: [{ id: ID_PACIENTE, label: PACIENTE.nome, descricao: null }],
          meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }),
      '/api/lookups/profissionais': () =>
        json({
          data: [{ id: ID_PROFISSIONAL, label: 'Dra. Ana Teste', descricao: null }],
          meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }),
      ...rotas.rotas,
    },
  });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/prontuarios', fetchMock) };
}

describe('Prontuários (/prontuarios)', () => {
  it('mostra título, descrição e o card de pacientes com registro clínico', async () => {
    renderTela();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Prontuarios' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Busque um paciente para acessar seu prontuario medico completo.'),
    ).toBeVisible();
    expect(await screen.findByText('Lucas Zanchet Fernandes')).toBeVisible();
    expect(screen.getByText('1 registro(s)')).toBeVisible();
  });

  it('lista vazia mostra o estado vazio', async () => {
    renderTela(api({ rotas: { [API]: () => pagina([]) } }));
    expect(
      await screen.findByText('Nenhum paciente com registro clínico encontrado.'),
    ).toBeVisible();
  });

  it('seleciona um paciente da lista e mostra o cabeçalho e as abas', async () => {
    const { user } = renderTela();
    await user.click(await screen.findByText('Lucas Zanchet Fernandes'));

    expect(await screen.findByRole('heading', { name: 'Lucas Zanchet Fernandes' })).toBeVisible();
    expect(screen.getByText('lucas@biologicanet.com.br')).toBeVisible();
    expect(screen.getByText('65999979796')).toBeVisible();
    expect(screen.getByText(/Nasc: 06\/03\/1991/)).toBeVisible();
    expect(screen.getByText('Sexo: Masculino')).toBeVisible();
    for (const aba of [
      'Prontuario',
      'Atendimentos',
      'Receitas',
      'Anamneses',
      'Histórico Clínico',
    ]) {
      expect(screen.getByRole('tab', { name: new RegExp(aba) })).toBeVisible();
    }
    expect(screen.getByRole('tab', { name: 'Prontuario' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  describe('exportar prontuário (issue #158)', () => {
    const URL_EXPORTAR = `${API}/${ID_PACIENTE}/exportar`;
    const respostaExportacao = (nome: string) => () =>
      new Response('arquivo', {
        headers: { 'Content-Disposition': `attachment; filename="${nome}"` },
      });

    function prepararDownload() {
      URL.createObjectURL = vi.fn(() => 'blob:1');
      URL.revokeObjectURL = vi.fn();
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    }

    it('exporta o PDF do prontuário de todos os profissionais do acesso', async () => {
      prepararDownload();
      const fetchMock = api({ rotas: { [URL_EXPORTAR]: respostaExportacao('prontuario.pdf') } });
      const { user } = renderTela(fetchMock);
      await user.click(await screen.findByText('Lucas Zanchet Fernandes'));

      await user.click(await screen.findByRole('button', { name: 'Exportar prontuário' }));
      await user.click(await screen.findByRole('button', { name: 'Exportar' }));

      await waitFor(() => expect(chamadasPara(fetchMock, URL_EXPORTAR)).toHaveLength(1));
      const [url] = chamadasPara(fetchMock, URL_EXPORTAR)[0] as [string];
      expect(new URL(url, 'http://localhost').searchParams.get('incluirAnexos')).toBe('false');
      expect(new URL(url, 'http://localhost').searchParams.has('profissionalId')).toBe(false);
    });

    it('pede o ZIP com os anexos e restringe a um profissional', async () => {
      prepararDownload();
      const fetchMock = api({ rotas: { [URL_EXPORTAR]: respostaExportacao('prontuario.zip') } });
      const { user } = renderTela(fetchMock);
      await user.click(await screen.findByText('Lucas Zanchet Fernandes'));

      await user.click(await screen.findByRole('button', { name: 'Exportar prontuário' }));
      await user.click(screen.getByLabelText('Incluir exames e anexos (gera um ZIP)'));
      await user.click(screen.getByRole('combobox', { name: 'Profissional' }));
      await user.click(await screen.findByText('Dra. Ana Teste'));
      await user.click(screen.getByRole('button', { name: 'Exportar' }));

      await waitFor(() => expect(chamadasPara(fetchMock, URL_EXPORTAR)).toHaveLength(1));
      const [url] = chamadasPara(fetchMock, URL_EXPORTAR)[0] as [string];
      const params = new URL(url, 'http://localhost').searchParams;
      expect(params.get('incluirAnexos')).toBe('true');
      expect(params.get('profissionalId')).toBe(ID_PROFISSIONAL);
    });

    it.each([
      'consultorio-assistencial.prontuarios.exportar',
      'configuracoes-gestao.dados-pessoais.exportar',
    ] as const)('sem a permissão %s, o botão não aparece', async (faltando) => {
      const usuario = {
        ...USUARIO_TESTE,
        permissoes: USUARIO_TESTE.permissoes.filter((p) => p !== faltando),
      };
      const { user } = renderTela(api({ usuario }));
      await user.click(await screen.findByText('Lucas Zanchet Fernandes'));
      await screen.findByRole('heading', { name: 'Lucas Zanchet Fernandes' });

      expect(screen.queryByRole('button', { name: 'Exportar prontuário' })).not.toBeInTheDocument();
    });

    it('em inglês: botão e janela traduzidos', async () => {
      const usuario = {
        ...USUARIO_TESTE,
        preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' as const },
      };
      const { user } = renderTela(api({ usuario }));
      await user.click(await screen.findByText('Lucas Zanchet Fernandes'));

      await user.click(await screen.findByRole('button', { name: 'Export medical record' }));

      expect(await screen.findByText('Export full medical record')).toBeVisible();
      expect(
        screen.getByLabelText('Include exams and attachments (generates a ZIP)'),
      ).toBeVisible();
    });
  });

  it('aba Prontuário: salva os campos preenchidos', async () => {
    let corpo: Record<string, unknown> = {};
    const fetchMock = api({
      rotas: {
        [`${API}/${ID_PACIENTE}`]: (init) => {
          if (ehLeitura(init)) return json(PRONTUARIO_VAZIO);
          corpo = corpoDe(init);
          return json({ ...PRONTUARIO_VAZIO, ...corpo, updatedAt: '2026-10-16T10:00:00.000Z' });
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await user.click(await screen.findByText('Lucas Zanchet Fernandes'));

    await user.type(await screen.findByLabelText('Alergias'), 'Dipirona');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(corpo).toMatchObject({ alergias: 'Dipirona' }));
  });

  it('aba Atendimentos: Novo Atendimento exige o profissional e envia o corpo', async () => {
    let corpo: Record<string, unknown> = {};
    const fetchMock = api({
      rotas: {
        [`${API}/${ID_PACIENTE}/atendimentos`]: (init) => {
          if (ehLeitura(init)) return pagina([]);
          corpo = corpoDe(init);
          return json({
            id: '00000000-0000-4000-8000-0000000000c1',
            pacienteId: ID_PACIENTE,
            profissionalId: ID_PROFISSIONAL,
            profissionalNome: 'Dra. Ana Teste',
            tipo: null,
            queixa: 'Dor de cabeça',
            evolucao: null,
            diagnostico: null,
            conduta: null,
            observacoes: null,
            status: 'EM_ANDAMENTO',
            modelo: null,
            respostas: null,
            assinadoEm: null,
            assinadoPorNome: null,
            totalAdendos: 0,
            createdAt: '2026-10-16T10:00:00.000Z',
            updatedAt: '2026-10-16T10:00:00.000Z',
          } satisfies Atendimento);
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await user.click(await screen.findByText('Lucas Zanchet Fernandes'));
    await user.click(screen.getByRole('tab', { name: 'Atendimentos' }));
    expect(await screen.findByText('Nenhum atendimento registrado.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Novo Atendimento' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Atendimento' });
    await user.click(within(modal).getByRole('button', { name: 'Criar' }));
    expect(await within(modal).findByText('Selecione o profissional.')).toBeVisible();

    await user.click(within(modal).getByRole('combobox', { name: 'Profissional' }));
    await user.click(await screen.findByRole('option', { name: /Dra. Ana Teste/ }));
    await user.type(within(modal).getByLabelText('Queixa'), 'Dor de cabeça');
    await user.click(within(modal).getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({ profissionalId: ID_PROFISSIONAL, queixa: 'Dor de cabeça' });
    expect(chamadasPara(fetchMock, `${API}/${ID_PACIENTE}/atendimentos`).length).toBeGreaterThan(1);
  });

  it('aba Anamneses: Nova Anamnese não exige profissional', async () => {
    let corpo: Record<string, unknown> = {};
    const fetchMock = api({
      rotas: {
        [`${API}/${ID_PACIENTE}/anamneses`]: (init) => {
          if (ehLeitura(init)) return pagina([]);
          corpo = corpoDe(init);
          return json({
            id: '00000000-0000-4000-8000-0000000000c2',
            pacienteId: ID_PACIENTE,
            profissionalId: null,
            profissionalNome: null,
            queixaPrincipal: 'Febre',
            historiaDoencaAtual: null,
            exameFisico: null,
            hipoteseDiagnostica: null,
            conduta: null,
            createdAt: '2026-10-16T10:00:00.000Z',
            updatedAt: '2026-10-16T10:00:00.000Z',
          });
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await user.click(await screen.findByText('Lucas Zanchet Fernandes'));
    await user.click(screen.getByRole('tab', { name: 'Anamneses' }));
    expect(await screen.findByText('Nenhuma anamnese registrada.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Nova Anamnese' }));
    const modal = await screen.findByRole('dialog', { name: 'Nova Anamnese' });
    await user.type(within(modal).getByLabelText('Queixa Principal'), 'Febre');
    await user.click(within(modal).getByRole('button', { name: 'Criar Anamnese' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({ queixaPrincipal: 'Febre' });
  });

  it('aba Histórico Clínico mostra o selo com a contagem', async () => {
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_PACIENTE}/historico-clinico`]: () =>
            pagina([
              {
                id: '00000000-0000-4000-8000-0000000000c3',
                tipo: 'ATENDIMENTO',
                rotulo: 'Consulta',
                data: '2026-10-16T10:00:00.000Z',
                profissionalNome: 'Dra. Ana Teste',
                resumo: 'Sem alterações',
              },
            ]),
        },
      }),
    );
    await user.click(await screen.findByText('Lucas Zanchet Fernandes'));

    expect(await screen.findByRole('tab', { name: /Histórico Clínico.*1/ })).toBeVisible();
    await user.click(screen.getByRole('tab', { name: /Histórico Clínico/ }));
    expect(await screen.findByText('Sem alterações')).toBeVisible();
    expect(screen.getByText('Consulta')).toBeVisible();
  });

  it('aba Receitas lista as prescrições do paciente (tela Receituários)', async () => {
    const { user } = renderTela(
      api({
        rotas: {
          [`${API}/${ID_PACIENTE}/receitas`]: () =>
            pagina([
              {
                id: '00000000-0000-4000-8000-0000000000d1',
                numero: 12,
                tipo: 'AMARELA',
                blocoId: '00000000-0000-4000-8000-0000000000e1',
                pacienteId: ID_PACIENTE,
                pacienteNome: PACIENTE.nome,
                profissionalId: ID_PROFISSIONAL,
                profissionalNome: 'Dra. Ana Teste',
                atendimentoId: null,
                medicacao: 'Medicamento X 10mg',
                posologia: '1 comprimido à noite',
                dataPrescricao: '2026-11-15',
                createdAt: '2026-11-15T12:00:00.000Z',
              },
            ]),
        },
      }),
    );
    await user.click(await screen.findByText('Lucas Zanchet Fernandes'));
    await user.click(await screen.findByRole('tab', { name: /Receitas/ }));

    expect(await screen.findByText('Medicamento X 10mg')).toBeVisible();
    expect(screen.getByText('nº 000012')).toBeVisible();
    expect(screen.getByText('Amarela (A)')).toBeVisible();
    expect(screen.getByText('1 comprimido à noite')).toBeVisible();
    expect(screen.getByText('15/11/2026')).toBeVisible();
  });

  it('aba Receitas sem prescrições mostra o estado vazio', async () => {
    const { user } = renderTela(
      api({ rotas: { [`${API}/${ID_PACIENTE}/receitas`]: () => pagina([]) } }),
    );
    await user.click(await screen.findByText('Lucas Zanchet Fernandes'));
    await user.click(await screen.findByRole('tab', { name: /Receitas/ }));
    expect(await screen.findByText('Nenhuma receita registrada.')).toBeVisible();
  });
});
