import { PREFERENCIAS_PADRAO, type ContratoSala, type Sala } from '@torres/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MOTIVO_ID, rotaMotivosCancelamento } from '@/test/motivos-cancelamento';
import {
  apiFalsa,
  chamadasPara,
  json,
  renderApp,
  USUARIO_TESTE,
  type ApiFalsaOptions,
} from '@/test/render-app';

vi.setConfig({ testTimeout: 30_000 });

const uploadMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/upload-arquivo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/upload-arquivo')>()),
  uploadArquivo: uploadMock,
}));

const SALAS = '/api/gestao-profissionais/salas';
const API = '/api/gestao-profissionais/contratos-sala';
const SALA_ID = '00000000-0000-4000-8000-0000000000a1';
const PROF_ID = '00000000-0000-4000-8000-0000000000a2';
const PACIENTE_ID = '00000000-0000-4000-8000-0000000000a3';
const ARQUIVO_ID = '00000000-0000-4000-8000-0000000000a4';
const ID_1 = '00000000-0000-4000-8000-0000000000b1';
const ID_2 = '00000000-0000-4000-8000-0000000000b2';
const ID_3 = '00000000-0000-4000-8000-0000000000b3';

function contrato(parcial: Partial<ContratoSala>): ContratoSala {
  return {
    id: ID_1,
    numero: 1,
    modalidade: 'TURNO',
    salaId: SALA_ID,
    salaNome: 'Sala Azul',
    salaNumero: '07',
    locatarioTipo: 'PROFISSIONAL',
    locatarioId: PROF_ID,
    locatarioNome: 'Dra. Ana Teste',
    especialidade: 'Nutrição',
    valorUnitario: 870,
    quantidadeMensal: 1,
    valorTotalMensal: 870,
    permuta: false,
    tipoReceita: 'FIXO',
    diaVencimento: 5,
    formaPagamentoId: null,
    formaPagamentoNome: null,
    indiceReajuste: 'IGPM',
    dataInicio: '2026-09-30',
    dataFim: '2027-09-29',
    dias: [{ diaSemana: 2, inicio: '14:00', fim: '18:00' }],
    permiteIndicacao: true,
    participaEventos: false,
    observacoes: null,
    status: 'ATIVO',
    assinadoEm: null,
    semCobrancaNoMes: false,
    encerradoEm: null,
    motivoEncerramento: null,
    pdfArquivoId: null,
    pdfNome: null,
    createdAt: '2026-09-22T12:00:00.000Z',
    updatedAt: '2026-09-22T12:00:00.000Z',
    ...parcial,
  };
}

const CONTRATOS = [
  contrato({}),
  contrato({
    id: ID_2,
    modalidade: 'MENSAL',
    locatarioTipo: 'CLIENTE',
    locatarioId: PACIENTE_ID,
    locatarioNome: 'Bruno Cliente Teste',
    valorUnitario: 6750,
    quantidadeMensal: null,
    valorTotalMensal: 6750,
    dataFim: null,
    dias: [],
    pdfArquivoId: ARQUIVO_ID,
    pdfNome: 'contrato.pdf',
  }),
  contrato({
    id: ID_3,
    modalidade: 'HORA',
    locatarioNome: 'Carla Hora Teste',
    valorUnitario: 87.5,
    quantidadeMensal: 4,
    valorTotalMensal: 350,
    status: 'ENCERRADO',
  }),
];

const SALA: Sala = {
  id: SALA_ID,
  nome: 'Sala Azul',
  numero: '07',
  andar: null,
  tipo: 'CONSULTORIO',
  capacidade: 1,
  metragem: null,
  valorHora: null,
  valorTurno: null,
  valorMensal: null,
  equipamentos: null,
  ativo: true,
  emUso: true,
  ocupada: true,
  locatarios: [],
  createdAt: '2026-09-01T12:00:00.000Z',
  updatedAt: '2026-09-01T12:00:00.000Z',
};

function pagina<T>(data: T[]) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
}

const corpoDe = (init?: RequestInit) => JSON.parse(String(init?.body)) as Record<string, unknown>;
const ehLeitura = (init?: RequestInit) => !init?.method || init.method === 'GET';

function lookup(...itens: Array<[string, string]>) {
  return pagina(itens.map(([id, label]) => ({ id, label, descricao: null })));
}

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({
    ...rotas,
    rotas: {
      [SALAS]: () => pagina([SALA]),
      [API]: () => pagina(CONTRATOS),
      '/api/lookups/profissionais': () => lookup([PROF_ID, 'Dra. Ana Teste']),
      '/api/lookups/pacientes': () => lookup([PACIENTE_ID, 'Bruno Cliente Teste']),
      '/api/lookups/formas-pagamento': () =>
        lookup(['00000000-0000-4000-8000-0000000000c1', 'PIX']),
      ...rotaMotivosCancelamento,
      ...rotas.rotas,
    },
  });
}

async function renderAba(fetchMock = api()) {
  const user = userEvent.setup();
  const view = renderApp('/salas', fetchMock);
  await user.click(await screen.findByRole('tab', { name: 'Contratos' }));
  return { user, ...view };
}

const linha = (nome: string) => screen.getByText(nome).closest('tr') as HTMLElement;

beforeEach(() => {
  uploadMock.mockReset();
});

/** Sala, locatário, valor e início: o mínimo para as regras cruzadas do formulário rodarem. */
async function preencherBase(
  user: ReturnType<typeof userEvent.setup>,
  modal: HTMLElement,
  { cliente = false, valor = '150000', rotuloValor = /Valor Mensal/ } = {},
) {
  await user.click(within(modal).getByRole('combobox', { name: /Sala/ }));
  await user.click(await screen.findByRole('option', { name: 'Sala Azul (Nº 07)' }));
  await user.click(
    within(modal).getByRole('combobox', { name: cliente ? /Cliente/ : /Profissional/ }),
  );
  await user.click(
    await screen.findByRole('option', {
      name: cliente ? /Bruno Cliente Teste/ : /Dra. Ana Teste/,
    }),
  );
  await user.type(within(modal).getByLabelText(rotuloValor), valor);
  await user.type(within(modal).getByLabelText('Data Início'), '2026-10-01');
}

describe('Gestão de Salas: aba Contratos', () => {
  it('lista os contratos com tipo, dias, valor, vigência, status e PDF', async () => {
    await renderAba();

    const turno = linha('Dra. Ana Teste');
    expect(await within(turno).findByText('Sala Azul')).toBeVisible();
    expect(within(turno).getByText('Por Turno')).toBeVisible();
    expect(within(turno).getByText('Ter 14:00-18:00')).toBeVisible();
    expect(within(turno).getByText(/870,00\/turno/)).toBeVisible();
    expect(within(turno).getByText('1 turno(s)')).toBeVisible();
    expect(within(turno).getByText('30/09/2026 a 29/09/2027')).toBeVisible();
    expect(within(turno).getByText('ativo')).toBeVisible();
    expect(within(turno).getByRole('button', { name: /Enviar PDF/ })).toBeVisible();

    const mensal = linha('Bruno Cliente Teste');
    expect(within(mensal).getByText('Mensal (Fixo)')).toBeVisible();
    expect(within(mensal).getByText(/6\.750,00\/mês/)).toBeVisible();
    expect(within(mensal).getByText('30/09/2026 a indeterminado')).toBeVisible();
    expect(within(mensal).getByRole('button', { name: /Baixar PDF/ })).toBeVisible();
    expect(within(mensal).getByRole('button', { name: /Remover PDF/ })).toBeVisible();

    const hora = linha('Carla Hora Teste');
    expect(within(hora).getByText('Por Hora Avulsa')).toBeVisible();
    expect(within(hora).getByText('4h contratadas')).toBeVisible();
    expect(within(hora).getByText('encerrado')).toBeVisible();
  });

  it('mostra Novo Contrato e Exportar, e o estado vazio sem contratos', async () => {
    await renderAba(api({ rotas: { [API]: () => pagina([]) } }));

    expect(screen.getByRole('button', { name: 'Novo Contrato' })).toBeVisible();
    expect(await screen.findByText('Nenhum contrato cadastrado.')).toBeVisible();
    expect(screen.getByRole('button', { name: /Exportar/ })).toBeVisible();
  });

  it('ordena e consulta a API pelos parâmetros da tabela', async () => {
    const fetchMock = api();
    const { user } = await renderAba(fetchMock);
    await screen.findByText('Dra. Ana Teste');

    await user.click(screen.getByRole('button', { name: /Vigência/ }));
    await waitFor(() => {
      const ultima = chamadasPara(fetchMock, API).at(-1)?.[0] ?? '';
      expect(new URL(ultima, 'http://x').searchParams.get('sort')).toBe('dataInicio:asc');
    });
  });

  it('lupa abre os Detalhes do Contrato com as seções do inventário', async () => {
    const { user } = await renderAba();
    await screen.findByText('Dra. Ana Teste');

    await user.click(
      screen.getByRole('button', { name: 'Detalhes do contrato de Dra. Ana Teste' }),
    );
    const modal = await screen.findByRole('dialog', { name: 'Detalhes do Contrato' });
    const valorDe = (rotulo: string) =>
      within(modal).getByText(rotulo).nextElementSibling as HTMLElement;
    expect(valorDe('Sala')).toHaveTextContent('Sala Azul');
    expect(valorDe('Locatário')).toHaveTextContent('Dra. Ana Teste');
    expect(valorDe('Tipo Locatário')).toHaveTextContent('Profissional');
    expect(valorDe('Especialidade')).toHaveTextContent('Nutrição');
    expect(valorDe('Valor Unitário')).toHaveTextContent(/870,00\/turno/);
    expect(valorDe('Valor Total Mensal')).toHaveTextContent(/870,00/);
    expect(valorDe('Dia Vencimento')).toHaveTextContent('Dia 5');
    expect(valorDe('Tipo Receita')).toHaveTextContent('Fixo');
    expect(valorDe('Índice de Reajuste')).toHaveTextContent('IGP-M');
    expect(valorDe('Início')).toHaveTextContent('30/09/2026');
    expect(valorDe('Fim')).toHaveTextContent('29/09/2027');
    expect(valorDe('Terça')).toHaveTextContent('14:00 às 18:00');
    expect(valorDe('Permite Indicação')).toHaveTextContent('Sim');
    expect(valorDe('Participa de Eventos')).toHaveTextContent('Não');
    expect(valorDe('Criado em')).toHaveTextContent('22/09/2026');

    await user.click(within(modal).getByRole('button', { name: 'Editar' }));
    expect(await screen.findByRole('dialog', { name: 'Editar Contrato' })).toBeVisible();
  });

  it('Novo Contrato: valida os obrigatórios sem enviar', async () => {
    const fetchMock = api();
    const { user } = await renderAba(fetchMock);
    await screen.findByText('Dra. Ana Teste');

    await user.click(screen.getByRole('button', { name: 'Novo Contrato' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Contrato' });
    expect(within(modal).getByRole('radio', { name: /Mensal \(Fixo\)/ })).toBeChecked();
    expect(within(modal).getByLabelText('Dia Vencimento')).toHaveValue(10);
    expect(within(modal).getByLabelText('Permite indicação de pacientes')).toBeChecked();
    expect(within(modal).getByLabelText('Participa de eventos')).not.toBeChecked();

    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    expect(await within(modal).findByText('Sala é obrigatória.')).toBeVisible();
    expect(within(modal).getByText('Locatário é obrigatório.')).toBeVisible();
    expect(within(modal).getByText('Informe o valor')).toBeVisible();
    expect(within(modal).getByText('Data de início é obrigatória.')).toBeVisible();
    expect(chamadasPara(fetchMock, API).filter(([, i]) => i?.method === 'POST')).toHaveLength(0);
  });

  it('Novo Contrato Por Turno: campos da modalidade, total estimado e corpo enviado', async () => {
    let corpo: Record<string, unknown> = {};
    const fetchMock = api({
      rotas: {
        [API]: (init) => {
          if (ehLeitura(init)) return pagina(CONTRATOS);
          corpo = corpoDe(init);
          return json(contrato({}), 201);
        },
      },
    });
    const { user } = await renderAba(fetchMock);
    await screen.findByText('Dra. Ana Teste');

    await user.click(screen.getByRole('button', { name: 'Novo Contrato' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Contrato' });
    await user.click(within(modal).getByRole('radio', { name: /Por Turno/ }));
    expect(within(modal).getByLabelText(/Valor por Turno/)).toBeVisible();
    expect(within(modal).getByLabelText(/Turnos Contratados\/mês/)).toBeVisible();
    expect(within(modal).queryByLabelText('Tipo de Receita')).not.toBeInTheDocument();

    await user.click(within(modal).getByRole('combobox', { name: /Sala/ }));
    await user.click(await screen.findByRole('option', { name: 'Sala Azul (Nº 07)' }));
    await user.click(within(modal).getByRole('combobox', { name: /Profissional/ }));
    await user.click(await screen.findByRole('option', { name: /Dra. Ana Teste/ }));
    await user.type(within(modal).getByLabelText(/Valor por Turno/), '87000');
    await user.type(within(modal).getByLabelText(/Turnos Contratados\/mês/), '2');
    expect(within(modal).getByText(/Total mensal estimado: R\$\s1\.740,00/)).toBeVisible();
    await user.type(within(modal).getByLabelText('Data Início'), '2026-10-01');
    await user.click(within(modal).getByRole('button', { name: 'Ter' }));
    expect(within(modal).getByLabelText('Terça: hora inicial')).toHaveValue('08:00');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      modalidade: 'TURNO',
      salaId: SALA_ID,
      locatarioTipo: 'PROFISSIONAL',
      locatarioId: PROF_ID,
      valorUnitario: 870,
      quantidadeMensal: 2,
      permuta: false,
      diaVencimento: 10,
      indiceReajuste: 'NENHUM',
      dataInicio: '2026-10-01',
      dataFim: null,
      dias: [{ diaSemana: 2, inicio: '08:00', fim: '18:00' }],
      permiteIndicacao: true,
      participaEventos: false,
    });
    expect(chamadasPara(fetchMock, API).filter(([, i]) => ehLeitura(i)).length).toBeGreaterThan(1);
  });

  it('Novo Contrato: Cliente busca nos pacientes e Hora Avulsa pede as horas', async () => {
    const fetchMock = api();
    const { user } = await renderAba(fetchMock);
    await screen.findByText('Dra. Ana Teste');

    await user.click(screen.getByRole('button', { name: 'Novo Contrato' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Contrato' });
    await user.click(within(modal).getByRole('radio', { name: 'Cliente' }));
    await user.click(within(modal).getByRole('combobox', { name: /Cliente/ }));
    expect(await screen.findByRole('option', { name: /Bruno Cliente Teste/ })).toBeVisible();
    expect(chamadasPara(fetchMock, '/api/lookups/pacientes').length).toBeGreaterThan(0);
    await user.keyboard('{Escape}');

    await user.click(within(modal).getByRole('radio', { name: /Hora Avulsa/ }));
    expect(within(modal).getByLabelText(/Valor por Hora/)).toBeVisible();
    expect(within(modal).getByLabelText(/Horas Contratadas\/mês/)).toBeVisible();
    await preencherBase(user, modal, {
      cliente: true,
      valor: '8750',
      rotuloValor: /Valor por Hora/,
    });
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));
    expect(await within(modal).findByText('Horas contratadas é obrigatório.')).toBeVisible();
  });

  it('Novo Contrato: fim antes do início e hora final antes da inicial mostram erro', async () => {
    const { user } = await renderAba();
    await screen.findByText('Dra. Ana Teste');

    await user.click(screen.getByRole('button', { name: 'Novo Contrato' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Contrato' });
    await preencherBase(user, modal);
    await user.type(within(modal).getByLabelText('Data Fim (opcional)'), '2026-09-01');
    await user.click(within(modal).getByRole('button', { name: 'Seg' }));
    const fim = within(modal).getByLabelText('Segunda: hora final');
    await user.clear(fim);
    await user.type(fim, '07:00');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    expect(
      await within(modal).findByText('A data de fim não pode ser anterior à data de início'),
    ).toBeVisible();
    expect(within(modal).getByText('A hora final deve ser depois da hora inicial')).toBeVisible();
    await user.click(within(modal).getByRole('button', { name: 'Seg' }));
    expect(within(modal).queryByLabelText('Segunda: hora final')).not.toBeInTheDocument();
  });

  it('Editar Contrato: abre com os valores atuais e envia PATCH', async () => {
    let corpo: Record<string, unknown> = {};
    const { user } = await renderAba(
      api({
        rotas: {
          [`${API}/${ID_1}`]: (init) => {
            corpo = corpoDe(init);
            return json(contrato({}));
          },
        },
      }),
    );
    await screen.findByText('Dra. Ana Teste');

    await user.click(screen.getByRole('button', { name: 'Editar contrato de Dra. Ana Teste' }));
    const modal = await screen.findByRole('dialog', { name: 'Editar Contrato' });
    expect(within(modal).getByRole('radio', { name: /Por Turno/ })).toBeChecked();
    expect((within(modal).getByLabelText(/Valor por Turno/) as HTMLInputElement).value).toMatch(
      /870,00/,
    );
    expect(within(modal).getByLabelText(/Turnos Contratados\/mês/)).toHaveValue(1);
    expect(within(modal).getByText(/Total mensal estimado: R\$\s870,00/)).toBeVisible();
    expect(within(modal).getByLabelText('Especialidade')).toHaveValue('Nutrição');
    expect(within(modal).getByLabelText('Dia Vencimento')).toHaveValue(5);
    expect(within(modal).getByLabelText('Terça: hora inicial')).toHaveValue('14:00');
    expect(within(modal).getByLabelText('Terça: hora final')).toHaveValue('18:00');

    await user.clear(within(modal).getByLabelText('Especialidade'));
    await user.type(within(modal).getByLabelText('Especialidade'), 'Nutrição esportiva');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      modalidade: 'TURNO',
      especialidade: 'Nutrição esportiva',
      valorUnitario: 870,
      quantidadeMensal: 1,
      indiceReajuste: 'IGPM',
      dataInicio: '2026-09-30',
      dataFim: '2027-09-29',
      dias: [{ diaSemana: 2, inicio: '14:00', fim: '18:00' }],
    });
  });

  it('Excluir: abre o modal de confirmação e só exclui ao confirmar', async () => {
    let excluido = false;
    const { user } = await renderAba(
      api({
        rotas: {
          [`${API}/${ID_3}`]: (init) => {
            excluido = init?.method === 'DELETE';
            return json(contrato({ id: ID_3 }));
          },
        },
      }),
    );
    await screen.findByText('Carla Hora Teste');

    await user.click(screen.getByRole('button', { name: 'Excluir contrato de Carla Hora Teste' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Excluir contrato?' });
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(excluido).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Excluir contrato de Carla Hora Teste' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }),
    );
    await waitFor(() => expect(excluido).toBe(true));
  });

  it('PDF: envia o arquivo escolhido e anexa ao contrato', async () => {
    let corpo: Record<string, unknown> = {};
    uploadMock.mockResolvedValue({ id: ARQUIVO_ID, nomeOriginal: 'contrato.pdf' });
    const { user } = await renderAba(
      api({
        rotas: {
          [`${API}/${ID_1}/pdf`]: (init) => {
            corpo = corpoDe(init);
            return json(contrato({ pdfArquivoId: ARQUIVO_ID, pdfNome: 'contrato.pdf' }));
          },
        },
      }),
    );
    await screen.findByText('Dra. Ana Teste');

    const arquivo = new File(['%PDF-1.4'], 'contrato.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('Arquivo PDF do contrato de Dra. Ana Teste'), arquivo);

    await waitFor(() => expect(corpo).toEqual({ arquivoId: ARQUIVO_ID }));
    expect(uploadMock).toHaveBeenCalledWith(expect.objectContaining({ uso: 'contrato-sala' }));
  });

  it('PDF: arquivo que não é PDF é recusado antes do envio', async () => {
    await renderAba();
    await screen.findByText('Dra. Ana Teste');

    const imagem = new File(['x'], 'foto.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Arquivo PDF do contrato de Dra. Ana Teste'), {
      target: { files: [imagem] },
    });

    expect(await screen.findByText(/Tipo de arquivo não permitido/)).toBeVisible();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('PDF: Remover PDF pede confirmação e grava arquivoId null', async () => {
    let corpo: Record<string, unknown> | null = null;
    const { user } = await renderAba(
      api({
        rotas: {
          [`${API}/${ID_2}/pdf`]: (init) => {
            corpo = corpoDe(init);
            return json(contrato({ id: ID_2 }));
          },
        },
      }),
    );
    await screen.findByText('Bruno Cliente Teste');

    await user.click(screen.getByRole('button', { name: /Remover PDF do contrato de Bruno/ }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Remover PDF?' });
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(corpo).toBeNull();

    await user.click(screen.getByRole('button', { name: /Remover PDF do contrato de Bruno/ }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remover' }),
    );
    await waitFor(() => expect(corpo).toEqual({ arquivoId: null }));
  });

  it('PDF: baixar abre o link temporário em outra aba', async () => {
    const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
    const { user } = await renderAba(
      api({
        rotas: {
          [`/api/arquivos/${ARQUIVO_ID}/link`]: () =>
            json({
              url: '/api/arquivos/x/conteudo?assinatura=1',
              expiraEm: '2026-10-21T12:05:00.000Z',
            }),
        },
      }),
    );
    await screen.findByText('Bruno Cliente Teste');

    await user.click(screen.getByRole('button', { name: /Baixar PDF do contrato de Bruno/ }));

    await waitFor(() =>
      expect(abrir).toHaveBeenCalledWith(
        '/api/arquivos/x/conteudo?assinatura=1',
        '_blank',
        'noopener,noreferrer',
      ),
    );
  });
});

describe('Gestão de Salas: Horas Utilizadas', () => {
  const HORAS = `${API}/${ID_3}/horas`;
  const hora = (extra: Record<string, unknown> = {}) => ({
    id: '00000000-0000-4000-8000-0000000000d1',
    contratoId: ID_3,
    data: '2026-10-21',
    entrada: '14:00',
    saida: '15:30',
    duracaoMinutos: 90,
    observacao: 'Retorno',
    createdAt: '2026-10-21T12:00:00.000Z',
    ...extra,
  });
  const resposta = (horas: ReturnType<typeof hora>[] = [], minutos = 0) =>
    json({
      data: horas,
      resumo: {
        valorHora: 87.5,
        horasContratadas: 4,
        minutosUtilizados: minutos,
        valorTotal: Math.round((minutos / 60) * 87.5 * 100) / 100,
      },
    });
  // O contrato de Hora Avulsa precisa estar ativo para mostrar o relógio.
  const ativo = [
    ...CONTRATOS.slice(0, 2),
    contrato({
      id: ID_3,
      modalidade: 'HORA',
      locatarioNome: 'Carla Hora Teste',
      valorUnitario: 87.5,
      quantidadeMensal: 4,
      valorTotalMensal: 350,
    }),
  ];

  function apiHoras(rotas: NonNullable<ApiFalsaOptions['rotas']> = {}) {
    return api({
      rotas: {
        [API]: () => pagina(ativo),
        [HORAS]: () => resposta(),
        ...rotas,
      },
    });
  }

  it('o relógio só aparece em contrato de Hora Avulsa ativo', async () => {
    await renderAba(apiHoras());
    await screen.findByText('Carla Hora Teste');

    expect(
      within(linha('Carla Hora Teste')).getByRole('button', { name: /Horas utilizadas/ }),
    ).toBeVisible();
    expect(
      within(linha('Dra. Ana Teste')).queryByRole('button', { name: /Horas utilizadas/ }),
    ).not.toBeInTheDocument();
    expect(
      within(linha('Bruno Cliente Teste')).queryByRole('button', { name: /Horas utilizadas/ }),
    ).not.toBeInTheDocument();
  });

  it('mostra o contrato, o mês, o estado vazio e o Gerar Cobrança desabilitado', async () => {
    const fetchMock = apiHoras();
    const { user } = await renderAba(fetchMock);
    await user.click(
      await screen.findByRole('button', { name: 'Horas utilizadas de Carla Hora Teste' }),
    );

    const modal = await screen.findByRole('dialog', { name: 'Horas Utilizadas' });
    expect(within(modal).getByText(/Sala Azul/)).toBeVisible();
    expect(within(modal).getByText(/87,50\/h/)).toBeVisible();
    expect(await within(modal).findByText('Nenhuma hora registrada neste mês')).toBeVisible();
    expect(within(modal).getByText(/0h \/ 4h/)).toBeVisible();
    expect(within(modal).getByText(/Total: 0,0h × R\$\s87,50 =/)).toBeVisible();
    expect(within(modal).getByLabelText('Entrada')).toHaveValue('08:00');
    expect(within(modal).getByLabelText('Saída')).toHaveValue('09:00');
    expect(within(modal).getByRole('button', { name: 'Gerar Cobrança' })).toBeDisabled();
    const mes = String(new Date().getMonth() + 1).padStart(2, '0');
    const consulta = chamadasPara(fetchMock, HORAS).at(-1)?.[0] ?? '';
    expect(new URL(consulta, 'http://x').searchParams.get('mes')).toBe(
      `${new Date().getFullYear()}-${mes}`,
    );
  });

  it('lista os lançamentos do mês com duração, observação e os totais', async () => {
    const { user } = await renderAba(apiHoras({ [HORAS]: () => resposta([hora()], 90) }));
    await user.click(
      await screen.findByRole('button', { name: 'Horas utilizadas de Carla Hora Teste' }),
    );

    const modal = await screen.findByRole('dialog', { name: 'Horas Utilizadas' });
    const registro = (await within(modal).findByText('21/10/2026')).closest('tr') as HTMLElement;
    expect(within(registro).getByText('14:00')).toBeVisible();
    expect(within(registro).getByText('15:30')).toBeVisible();
    expect(within(registro).getByText('1h30')).toBeVisible();
    expect(within(registro).getByText('Retorno')).toBeVisible();
    expect(within(modal).getByText(/1,5h \/ 4h/)).toBeVisible();
    expect(within(modal).getByText(/Total: 1,5h × R\$\s87,50 =/)).toBeVisible();
    expect(within(modal).getAllByText(/131,25/).length).toBeGreaterThan(0);
  });

  it('Adicionar envia o lançamento e valida a saída depois da entrada', async () => {
    let corpo: Record<string, unknown> | null = null;
    const { user } = await renderAba(
      apiHoras({
        [HORAS]: (init) => {
          if (ehLeitura(init)) return resposta();
          corpo = corpoDe(init);
          return json(hora(), 201);
        },
      }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Horas utilizadas de Carla Hora Teste' }),
    );
    const modal = await screen.findByRole('dialog', { name: 'Horas Utilizadas' });
    await within(modal).findByText('Nenhuma hora registrada neste mês');

    await user.clear(within(modal).getByLabelText('Saída'));
    await user.type(within(modal).getByLabelText('Saída'), '07:00');
    await user.click(within(modal).getByRole('button', { name: 'Adicionar' }));
    expect(await within(modal).findByText('A saída deve ser depois da entrada')).toBeVisible();
    expect(corpo).toBeNull();

    await user.clear(within(modal).getByLabelText('Saída'));
    await user.type(within(modal).getByLabelText('Saída'), '09:30');
    await user.type(within(modal).getByLabelText('Obs.'), 'Retorno');
    await user.click(within(modal).getByRole('button', { name: 'Adicionar' }));

    await waitFor(() => expect(corpo).not.toBeNull());
    expect(corpo).toMatchObject({ entrada: '08:00', saida: '09:30', observacao: 'Retorno' });
  });

  it('Remover pede confirmação e só remove ao confirmar', async () => {
    let removido = false;
    const { user } = await renderAba(
      apiHoras({
        [HORAS]: () => resposta([hora()], 90),
        [`${HORAS}/${hora().id}`]: (init) => {
          removido = init?.method === 'DELETE';
          return json(hora());
        },
      }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Horas utilizadas de Carla Hora Teste' }),
    );
    const modal = await screen.findByRole('dialog', { name: 'Horas Utilizadas' });

    await user.click(await within(modal).findByRole('button', { name: /Remover lançamento/ }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Remover lançamento?' });
    await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(removido).toBe(false);

    await user.click(within(modal).getByRole('button', { name: /Remover lançamento/ }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remover' }),
    );
    await waitFor(() => expect(removido).toBe(true));
  });
});

describe('Gestão de Salas: encerrar e cancelar contrato', () => {
  const hoje = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const encerrado = contrato({
    id: ID_3,
    locatarioNome: 'Carla Encerrada Teste',
    status: 'ENCERRADO',
    encerradoEm: '2026-09-30',
    motivoEncerramento: 'Fim do prazo',
  });
  const cancelado = contrato({
    id: ID_2,
    locatarioNome: 'Davi Cancelado Teste',
    status: 'CANCELADO',
    encerradoEm: '2026-09-30',
    motivoEncerramento: 'Rescisão amigável',
  });

  function apiFechar(rotas: NonNullable<ApiFalsaOptions['rotas']> = {}) {
    return api({
      rotas: { [API]: () => pagina([contrato({}), encerrado, cancelado]), ...rotas },
    });
  }

  it('só o contrato ativo tem os ícones Encerrar e Cancelar; os demais mostram a data', async () => {
    await renderAba(apiFechar());
    await screen.findByText('Dra. Ana Teste');

    const ativo = linha('Dra. Ana Teste');
    expect(within(ativo).getByRole('button', { name: /Encerrar contrato de/ })).toHaveAttribute(
      'title',
      'Encerrar contrato (término natural)',
    );
    expect(within(ativo).getByRole('button', { name: /Cancelar contrato de/ })).toHaveAttribute(
      'title',
      'Cancelar contrato (rescisão)',
    );
    for (const nome of ['Carla Encerrada Teste', 'Davi Cancelado Teste']) {
      const fechado = linha(nome);
      expect(
        within(fechado).queryByRole('button', { name: /Encerrar contrato de/ }),
      ).not.toBeInTheDocument();
      expect(
        within(fechado).queryByRole('button', { name: /Cancelar contrato de/ }),
      ).not.toBeInTheDocument();
      expect(within(fechado).getByText('Enc. 30/09/2026')).toBeVisible();
      expect(within(fechado).getByRole('button', { name: /Editar contrato de/ })).toBeVisible();
    }
    expect(within(linha('Carla Encerrada Teste')).getByText('encerrado')).toBeVisible();
    expect(within(linha('Davi Cancelado Teste')).getByText('cancelado')).toBeVisible();
  });

  it('Encerrar: abre o modal com a data de hoje, valida a data e envia o corpo', async () => {
    let corpo: Record<string, unknown> | null = null;
    const { user } = await renderAba(
      apiFechar({
        [`${API}/${ID_1}/encerrar`]: (init) => {
          corpo = corpoDe(init);
          return json(contrato({ status: 'ENCERRADO', encerradoEm: hoje() }));
        },
      }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Encerrar contrato de Dra. Ana Teste' }),
    );

    const modal = await screen.findByRole('dialog', { name: 'Encerrar Contrato' });
    expect(within(modal).getByText(/Sala Azul/)).toBeVisible();
    expect(within(modal).getByText(/Dra. Ana Teste/)).toBeVisible();
    expect(within(modal).getByLabelText(/Data de Encerramento/)).toHaveValue(hoje());
    expect(within(modal).getByPlaceholderText('Motivo do encerramento...')).toBeVisible();
    expect(
      within(modal).getByText(
        'Parcelas pendentes após a data de encerramento serão canceladas automaticamente.',
      ),
    ).toBeVisible();

    await user.clear(within(modal).getByLabelText(/Data de Encerramento/));
    await user.click(within(modal).getByRole('button', { name: 'Encerrar' }));
    expect(await within(modal).findByText('Data de encerramento é obrigatória.')).toBeVisible();
    expect(corpo).toBeNull();

    await user.type(within(modal).getByLabelText(/Data de Encerramento/), '2026-10-30');
    await user.type(within(modal).getByLabelText('Observação (opcional)'), 'Fim do prazo');
    await user.click(within(modal).getByRole('button', { name: 'Encerrar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({ data: '2026-10-30', observacao: 'Fim do prazo' });
  });

  it('Cancelar: abre a rescisão, Voltar não envia e confirmar grava a data e o motivo da lista', async () => {
    let corpo: Record<string, unknown> | null = null;
    const { user } = await renderAba(
      apiFechar({
        [`${API}/${ID_1}/cancelar`]: (init) => {
          corpo = corpoDe(init);
          return json(contrato({ status: 'CANCELADO', encerradoEm: hoje() }));
        },
      }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Cancelar contrato de Dra. Ana Teste' }),
    );

    const modal = await screen.findByRole('dialog', { name: 'Cancelar contrato (rescisão)' });
    expect(within(modal).getByLabelText(/Data de cancelamento/)).toHaveValue(hoje());
    expect(within(modal).getByRole('combobox', { name: /Motivo/ })).toBeVisible();
    expect(
      within(modal).getByText(
        'Parcelas pendentes após a data de cancelamento serão canceladas automaticamente.',
      ),
    ).toBeVisible();

    await user.click(within(modal).getByRole('button', { name: 'Voltar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Cancelar contrato de Dra. Ana Teste' }));
    const reaberto = await screen.findByRole('dialog', { name: 'Cancelar contrato (rescisão)' });
    // Sem motivo da lista, não envia.
    await user.click(within(reaberto).getByRole('button', { name: 'Cancelar contrato' }));
    expect(await within(reaberto).findByText('Motivo é obrigatório.')).toBeVisible();
    expect(corpo).toBeNull();

    await user.click(within(reaberto).getByRole('combobox', { name: /Motivo/ }));
    await user.click(await screen.findByRole('option', { name: 'Paciente desistiu' }));
    await user.type(within(reaberto).getByLabelText('Observação'), 'Rescisão amigável');
    await user.click(within(reaberto).getByRole('button', { name: 'Cancelar contrato' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({ data: hoje(), motivoId: MOTIVO_ID, observacao: 'Rescisão amigável' });
  });

  it('o erro 409 da API aparece sem fechar o modal', async () => {
    const { user } = await renderAba(
      apiFechar({
        [`${API}/${ID_1}/encerrar`]: () =>
          json(
            {
              statusCode: 409,
              code: 'CONTRATO_NAO_ATIVO',
              message: 'Só é possível encerrar ou cancelar um contrato ativo.',
            },
            409,
          ),
      }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Encerrar contrato de Dra. Ana Teste' }),
    );
    const modal = await screen.findByRole('dialog', { name: 'Encerrar Contrato' });
    await user.click(within(modal).getByRole('button', { name: 'Encerrar' }));

    expect(
      await screen.findByText('Só é possível encerrar ou cancelar um contrato ativo.'),
    ).toBeVisible();
    expect(screen.getByRole('dialog', { name: 'Encerrar Contrato' })).toBeVisible();
  });

  it('Detalhes mostra a data e o motivo do encerramento e da rescisão', async () => {
    const { user } = await renderAba(apiFechar());
    await screen.findByText('Dra. Ana Teste');

    await user.click(
      screen.getByRole('button', { name: 'Detalhes do contrato de Carla Encerrada Teste' }),
    );
    let modal = await screen.findByRole('dialog', { name: 'Detalhes do Contrato' });
    const valorDe = (rotulo: string) =>
      within(modal).getByText(rotulo).nextElementSibling as HTMLElement;
    expect(valorDe('Encerrado em')).toHaveTextContent('30/09/2026');
    expect(valorDe('Observação')).toHaveTextContent('Fim do prazo');
    await user.click(within(modal).getAllByRole('button', { name: 'Fechar' })[0] as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(
      screen.getByRole('button', { name: 'Detalhes do contrato de Davi Cancelado Teste' }),
    );
    modal = await screen.findByRole('dialog', { name: 'Detalhes do Contrato' });
    expect(valorDe('Cancelado em')).toHaveTextContent('30/09/2026');
    expect(valorDe('Motivo da rescisão')).toHaveTextContent('Rescisão amigável');
  });

  describe('Cobranças (issue #115)', () => {
    it('Gerar Cobranças do Mês chama a API e atualiza a tabela', async () => {
      let chamou = false;
      const { user } = await renderAba(
        api({
          rotas: {
            [`${API}/gerar-cobrancas-mes`]: (init) => {
              chamou = true;
              expect(init?.method).toBe('POST');
              return json({
                competencia: '2026-11',
                geradas: 1,
                jaExistentes: 1,
                semValorCalculavel: [],
              });
            },
          },
        }),
      );
      await screen.findByText('Dra. Ana Teste');

      await user.click(await screen.findByRole('button', { name: 'Gerar Cobranças do Mês' }));

      await waitFor(() => expect(chamou).toBe(true));
    });

    it('Contrato sem cobrança: mostra o aviso e gera a parcela manualmente', async () => {
      const semCobranca = contrato({
        id: ID_1,
        modalidade: 'TURNO',
        locatarioNome: 'Dra. Ana Teste',
        semCobrancaNoMes: true,
      });
      let corpo: Record<string, unknown> | null = null;
      const { user } = await renderAba(
        api({
          rotas: {
            [API]: () => pagina([semCobranca]),
            [`${API}/${ID_1}/gerar-parcela`]: (init) => {
              corpo = corpoDe(init);
              return json({ ...semCobranca, semCobrancaNoMes: false });
            },
          },
        }),
      );
      await screen.findByText('Dra. Ana Teste');
      expect(screen.getByText(/Sem cobrança em/)).toBeVisible();

      await user.click(
        screen.getByRole('button', { name: /Gerar parcela de .* de Dra\. Ana Teste/ }),
      );
      const modal = await screen.findByRole('dialog', { name: 'Contrato sem cobrança' });
      await user.type(within(modal).getByLabelText('Valor (R$)'), '80000');
      await user.clear(within(modal).getByLabelText('Data de Vencimento'));
      await user.type(within(modal).getByLabelText('Data de Vencimento'), '2026-11-10');
      await user.click(within(modal).getByRole('button', { name: 'Gerar Parcela' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(corpo).toMatchObject({ valor: 800, dataVencimento: '2026-11-10' });
    });

    it('Contrato sem cobrança: Confirmar sem cobrança chama a API e fecha o modal', async () => {
      const semCobranca = contrato({
        id: ID_1,
        modalidade: 'TURNO',
        locatarioNome: 'Dra. Ana Teste',
        semCobrancaNoMes: true,
      });
      let chamou = false;
      const { user } = await renderAba(
        api({
          rotas: {
            [API]: () => pagina([semCobranca]),
            [`${API}/${ID_1}/confirmar-sem-cobranca`]: () => {
              chamou = true;
              return new Response(null, { status: 204 });
            },
          },
        }),
      );
      await screen.findByText('Dra. Ana Teste');

      await user.click(
        screen.getByRole('button', { name: /Gerar parcela de .* de Dra\. Ana Teste/ }),
      );
      const modal = await screen.findByRole('dialog', { name: 'Contrato sem cobrança' });
      await user.click(within(modal).getByRole('button', { name: 'Confirmar sem cobrança' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(chamou).toBe(true);
    });
  });
});

describe('Gestão de Salas: assinatura do contrato (#142)', () => {
  const AGUARDANDO = contrato({
    id: ID_1,
    locatarioNome: 'Dra. Ana Teste',
    status: 'AGUARDANDO_ASSINATURA',
    modalidade: 'MENSAL',
  });
  const ATIVO = contrato({ id: ID_2, locatarioNome: 'Dr. Beto Teste', status: 'ATIVO' });

  it('mostra o selo "aguardando assinatura" e a ação só nesse contrato', async () => {
    await renderAba(api({ rotas: { [API]: () => pagina([AGUARDANDO, ATIVO]) } }));

    const aguardando = linha('Dra. Ana Teste');
    expect(await within(aguardando).findByText('aguardando assinatura')).toBeVisible();
    expect(
      within(aguardando).getByRole('button', {
        name: 'Registrar assinatura do contrato de Dra. Ana Teste',
      }),
    ).toBeVisible();
    expect(
      within(linha('Dr. Beto Teste')).queryByRole('button', { name: /Registrar assinatura/ }),
    ).not.toBeInTheDocument();
  });

  it('registrar assinatura exige a data e envia data e PDF para a API', async () => {
    let corpo: Record<string, unknown> = {};
    const fetchMock = api({
      rotas: {
        [API]: () => pagina([AGUARDANDO]),
        [`${API}/${ID_1}/assinar`]: (init) => {
          corpo = corpoDe(init);
          return json({ ...AGUARDANDO, status: 'ATIVO', assinadoEm: '2026-11-20' });
        },
      },
    });
    const { user } = await renderAba(fetchMock);

    await user.click(
      await screen.findByRole('button', {
        name: 'Registrar assinatura do contrato de Dra. Ana Teste',
      }),
    );
    const modal = await screen.findByRole('dialog', { name: 'Registrar assinatura' });
    const data = within(modal).getByLabelText(/Data da assinatura/);
    await user.clear(data);
    await user.click(within(modal).getByRole('button', { name: 'Registrar assinatura' }));
    expect(await within(modal).findByText('Data de assinatura é obrigatória.')).toBeVisible();
    expect(corpo).toEqual({});

    fireEvent.change(data, { target: { value: '2026-11-20' } });
    await user.click(within(modal).getByRole('button', { name: 'Registrar assinatura' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toEqual({ assinadoEm: '2026-11-20', pdfArquivoId: null });
  });

  it('Novo Contrato de profissional oferece "Aguardando assinatura" e envia o campo', async () => {
    let corpo: Record<string, unknown> = {};
    const fetchMock = api({
      rotas: {
        [API]: (init) => {
          if (ehLeitura(init)) return pagina(CONTRATOS);
          corpo = corpoDe(init);
          return json(AGUARDANDO, 201);
        },
      },
    });
    const { user } = await renderAba(fetchMock);
    await screen.findByText('Dra. Ana Teste');

    await user.click(screen.getByRole('button', { name: 'Novo Contrato' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Contrato' });
    await preencherBase(user, modal);
    await user.click(within(modal).getByRole('checkbox', { name: 'Aguardando assinatura' }));
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({ locatarioTipo: 'PROFISSIONAL', aguardandoAssinatura: true });
  });

  it('para cliente a opção "Aguardando assinatura" não aparece, e na edição também não', async () => {
    const { user } = await renderAba();
    await screen.findByText('Dra. Ana Teste');

    await user.click(screen.getByRole('button', { name: 'Novo Contrato' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Contrato' });
    expect(within(modal).getByRole('checkbox', { name: 'Aguardando assinatura' })).toBeVisible();
    await user.click(within(modal).getByRole('radio', { name: 'Cliente' }));
    expect(
      within(modal).queryByRole('checkbox', { name: 'Aguardando assinatura' }),
    ).not.toBeInTheDocument();
    await user.click(within(modal).getByRole('button', { name: 'Cancelar' }));

    await user.click(
      within(linha('Dra. Ana Teste')).getByRole('button', {
        name: 'Editar contrato de Dra. Ana Teste',
      }),
    );
    const edicao = await screen.findByRole('dialog', { name: 'Editar Contrato' });
    expect(
      within(edicao).queryByRole('checkbox', { name: 'Aguardando assinatura' }),
    ).not.toBeInTheDocument();
  });

  it('em inglês, o modal de assinatura aparece traduzido', async () => {
    const fetchMock = apiFalsa({
      usuario: {
        ...USUARIO_TESTE,
        preferencias: { ...PREFERENCIAS_PADRAO, idioma: 'en' },
      },
      rotas: {
        [SALAS]: () => pagina([SALA]),
        [API]: () => pagina([AGUARDANDO]),
        '/api/lookups/profissionais': () => lookup([PROF_ID, 'Dra. Ana Teste']),
      },
    });
    const { user } = await renderAba(fetchMock);

    await user.click(
      await screen.findByRole('button', {
        name: 'Record signature of the contract of Dra. Ana Teste',
      }),
    );

    const modal = await screen.findByRole('dialog', { name: 'Record signature' });
    expect(within(modal).getByLabelText(/Signature date/)).toBeVisible();
    expect(within(modal).getByText(/there is no electronic signature/)).toBeVisible();
  });
});
