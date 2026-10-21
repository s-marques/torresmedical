import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PERMISSOES,
  type BloqueioAgenda,
  type Especialidade,
  type HorarioAtendimento,
  type Profissional,
} from '@torres/shared';
import { describe, expect, it } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp, USUARIO_TESTE } from '@/test/render-app';
import { formatarComissao, formatarValor, iniciaisDe } from './formatadores';

const API = '/api/gestao-profissionais/profissionais';
const API_ESPECIALIDADES = '/api/gestao-profissionais/especialidades';
const ID_1 = '00000000-0000-4000-8000-0000000000b1';
const ID_2 = '00000000-0000-4000-8000-0000000000b2';
const ESP = '00000000-0000-4000-8000-0000000000c1';
const AGORA = '2026-10-20T12:00:00.000Z';

function profissional(parcial: Partial<Profissional>): Profissional {
  return {
    id: ID_1,
    nome: 'Ana Teste',
    especialidadeId: ESP,
    especialidadeNome: 'Endocrinologia',
    registro: 'CRM 1111/MT',
    outrasEspecialidades: 'Metabologia',
    email: 'ana@exemplo.test',
    telefone: '65999990001',
    duracaoPadrao: 60,
    valorConsulta: 600,
    comissao: null,
    corCalendario: 'rosa',
    cpf: null,
    rg: null,
    dataNascimento: null,
    naturalidade: null,
    estadoCivil: null,
    endereco: null,
    enderecoConsultorio: null,
    telefoneReceita: null,
    cnes: null,
    rodapeReceita: null,
    layoutReceita: 'PADRAO',
    memedApiToken: null,
    memedSecretKeyDefinida: false,
    fotoArquivoId: null,
    logoReceitaArquivoId: null,
    ativo: false,
    createdAt: AGORA,
    updatedAt: AGORA,
    ...parcial,
  };
}

const PROFISSIONAIS = [
  profissional({}),
  profissional({
    id: ID_2,
    nome: 'Bruno Teste',
    registro: null,
    telefone: null,
    email: null,
    valorConsulta: null,
    duracaoPadrao: 30,
    corCalendario: 'azul',
    ativo: true,
  }),
];

function pagina<T>(data: T[]) {
  return json({ data, meta: { page: 1, pageSize: 10, total: data.length, totalPages: 1 } });
}

type Corpo = Record<string, unknown>;
const corpoDe = (init?: RequestInit): Corpo => JSON.parse(String(init?.body)) as Corpo;
const ehLeitura = (init?: RequestInit) => !init?.method || init.method === 'GET';

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({
    ...rotas,
    rotas: {
      [API]: () => pagina(PROFISSIONAIS),
      '/api/lookups/especialidades': () =>
        pagina([{ id: ESP, label: 'Endocrinologia', descricao: null }]),
      ...rotas.rotas,
    },
  });
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/profissionais', fetchMock) };
}

const consulta = (fetchMock: ReturnType<typeof api>) => {
  const [url] = chamadasPara(fetchMock, API)
    .filter(([, i]) => ehLeitura(i))
    .at(-1) ?? [''];
  return Object.fromEntries(new URL(url, 'http://x').searchParams);
};

async function abrirMenuDaLinha(user: ReturnType<typeof userEvent.setup>, indice = 0) {
  await user.click(screen.getAllByRole('button', { name: 'Ações' })[indice] as HTMLElement);
}

describe('Profissionais (/profissionais)', () => {
  it('mostra o cabeçalho, as colunas do inventário e as linhas', async () => {
    const fetchMock = api();
    renderTela(fetchMock);

    expect(await screen.findByRole('heading', { name: 'Profissionais' })).toBeInTheDocument();
    expect(screen.getByText('Gerencie médicos, dentistas e outros profissionais.')).toBeVisible();
    const tabela = await screen.findByRole('table');
    expect(
      within(tabela)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual(['Nome', 'Registro', 'Telefone', 'Email', 'Duração', 'Consulta', 'Status', 'Ações']);
    expect(await screen.findByText('Ana Teste')).toBeVisible();
    expect(screen.getByText('CRM 1111/MT')).toBeVisible();
    expect(screen.getByText('(65) 99999-0001')).toBeVisible();
    expect(screen.getByText('60 min')).toBeVisible();
    expect(screen.getByText(/R\$\s*600,00/)).toBeVisible();
    expect(screen.getByText('Inativo', { selector: '[data-slot="badge"]' })).toBeVisible();
    expect(screen.getByText('Ativo', { selector: '[data-slot="badge"]' })).toBeVisible();
    for (const nome of ['Especialidades', 'Novo Profissional', 'Exportar']) {
      expect(screen.getByRole('button', { name: nome })).toBeVisible();
    }
    expect(screen.getByRole('link', { name: 'Tipos de Agendamento' })).toHaveAttribute(
      'href',
      '/config/tipos-agendamento',
    );
    expect(consulta(fetchMock)).toMatchObject({ page: '1' });
  });

  it('busca, filtro de status e ordenação chamam a API com os parâmetros', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Ana Teste');

    await user.type(screen.getByPlaceholderText('Buscar profissionais...'), 'ana');
    await waitFor(() => expect(consulta(fetchMock)).toMatchObject({ search: 'ana' }));

    await user.click(screen.getByRole('button', { name: 'Inativo' }));
    await waitFor(() => expect(consulta(fetchMock)).toMatchObject({ status: 'inativo' }));

    await user.click(screen.getByRole('button', { name: 'Consulta' }));
    await waitFor(() => expect(consulta(fetchMock)).toMatchObject({ sort: 'valorConsulta:asc' }));
  });

  it('clicar na linha abre o detalhe com os campos do inventário, Fechar e Editar', async () => {
    const { user } = renderTela();

    await user.click(await screen.findByText('Ana Teste'));

    const detalhe = await screen.findByRole('dialog', { name: 'Ana Teste' });
    for (const texto of [
      'Endocrinologia',
      'Metabologia',
      'CRM 1111/MT',
      'ana@exemplo.test',
      'Rosa',
    ]) {
      expect(within(detalhe).getByText(texto)).toBeVisible();
    }
    expect(within(detalhe).getByText('(65) 99999-0001')).toBeVisible();
    expect(within(detalhe).getByText('60 min')).toBeVisible();
    expect(within(detalhe).getByText('Comissão').nextElementSibling).toHaveTextContent('-');
    expect(within(detalhe).getByRole('button', { name: 'Editar' })).toBeVisible();
    await user.click(within(detalhe).getAllByRole('button', { name: 'Fechar' })[0] as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('Novo Profissional: salvar vazio mostra "O nome do profissional é obrigatório." e não envia', async () => {
    const fetchMock = api();
    const { user } = renderTela(fetchMock);
    await screen.findByText('Ana Teste');

    await user.click(screen.getByRole('button', { name: 'Novo Profissional' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Profissional' });
    for (const rotulo of [
      'Especialidade',
      'Registro (CRM/CRO)',
      'Outras Especialidades / Áreas de Atuação',
      'Email',
      'Telefone',
      'Duração padrão (min)',
      'Valor da consulta (R$)',
      'Comissão (%)',
      'CPF',
      'RG',
      'Data de Nascimento',
      'Naturalidade',
      'Estado Civil',
      'Endereço',
      'Endereço do Consultório',
      'Telefone para Receita',
      'CNES',
      'Rodapé da Receita (texto)',
      'Layout da Receita',
    ]) {
      expect(within(modal).getByLabelText(rotulo)).toBeVisible();
    }
    // Memed, horários, foto e logo só depois de cadastrar.
    expect(within(modal).queryByText('Receita Digital (Memed)')).not.toBeInTheDocument();
    expect(within(modal).queryByText('Horários de Atendimento')).not.toBeInTheDocument();
    expect(within(modal).getByText('Salve primeiro')).toBeVisible();
    expect(within(modal).getByRole('button', { name: 'Enviar' })).toBeDisabled();

    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    expect(await within(modal).findByText('O nome do profissional é obrigatório.')).toBeVisible();
    expect(chamadasPara(fetchMock, API).filter(([, i]) => i?.method === 'POST')).toHaveLength(0);
  });

  it('Novo Profissional: CPF inválido mostra o erro; salvar envia o corpo, fecha e recarrega a lista', async () => {
    let corpo: Corpo = {};
    const fetchMock = api({
      rotas: {
        [API]: (init) => {
          if (ehLeitura(init)) return pagina(PROFISSIONAIS);
          corpo = corpoDe(init);
          return json(
            profissional({ id: '00000000-0000-4000-8000-0000000000b3', nome: 'Nova' }),
            201,
          );
        },
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Ana Teste');

    await user.click(screen.getByRole('button', { name: 'Novo Profissional' }));
    const modal = await screen.findByRole('dialog', { name: 'Novo Profissional' });
    await user.type(within(modal).getByPlaceholderText('Nome completo'), 'Nova');
    await user.type(within(modal).getByLabelText('CPF'), '11111111111');
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));
    expect(await within(modal).findByText('CPF inválido')).toBeVisible();

    await user.clear(within(modal).getByLabelText('CPF'));
    await user.type(within(modal).getByLabelText('CPF'), '52998224725');
    await user.click(within(modal).getByRole('button', { name: 'Cadastrar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(corpo).toMatchObject({
      nome: 'Nova',
      cpf: '52998224725',
      duracaoPadrao: 30,
      corCalendario: 'azul',
      layoutReceita: 'PADRAO',
    });
    expect(chamadasPara(fetchMock, API).filter(([, i]) => ehLeitura(i))).toHaveLength(2);
  });

  it('Editar pelo menu da linha: abre preenchido, mostra Memed e horários e envia PATCH', async () => {
    let corpo: Corpo = {};
    let metodo = '';
    const fetchMock = api({
      rotas: {
        [`${API}/${ID_1}`]: (init) => {
          metodo = String(init?.method);
          corpo = corpoDe(init);
          return json(profissional({ nome: 'Ana Souza' }));
        },
        [`${API}/${ID_1}/horarios`]: () => json({ data: [] }),
      },
    });
    const { user } = renderTela(fetchMock);
    await screen.findByText('Ana Teste');

    await abrirMenuDaLinha(user);
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }));
    const modal = await screen.findByRole('dialog', { name: 'Editar Profissional' });
    const nome = within(modal).getByPlaceholderText('Nome completo');
    expect(nome).toHaveValue('Ana Teste');
    expect(within(modal).getByText('Receita Digital (Memed)')).toBeVisible();
    expect(await within(modal).findByText('Horários de Atendimento')).toBeVisible();
    expect(within(modal).getByText('Alterar foto')).toBeVisible();
    await user.clear(nome);
    await user.type(nome, 'Ana Souza');
    await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(metodo).toBe('PATCH');
    expect(corpo).toMatchObject({ nome: 'Ana Souza', registro: 'CRM 1111/MT', duracaoPadrao: 60 });
    // A Secret Key nunca é preenchida pela API: sai em branco (mantém a gravada).
    expect(corpo.memedSecretKey).toBeNull();
  });

  it('Editar pelo detalhe abre o formulário', async () => {
    const { user } = renderTela(
      api({ rotas: { [`${API}/${ID_1}/horarios`]: () => json({ data: [] }) } }),
    );

    await user.click(await screen.findByText('Ana Teste'));
    await user.click(await screen.findByRole('button', { name: 'Editar' }));

    expect(await screen.findByRole('dialog', { name: 'Editar Profissional' })).toBeVisible();
  });

  describe('menu da linha', () => {
    it('lista Editar, Bloqueios de Agenda, Ativar/Desativar conforme o status e Excluir', async () => {
      const { user } = renderTela();
      await screen.findByText('Ana Teste');

      await abrirMenuDaLinha(user, 0);
      expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual([
        'Editar',
        'Bloqueios de Agenda',
        'Ativar',
        'Excluir',
      ]);
      await user.keyboard('{Escape}');

      await abrirMenuDaLinha(user, 1);
      expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual([
        'Editar',
        'Bloqueios de Agenda',
        'Desativar',
        'Excluir',
      ]);
    });

    it('Ativar muda o status direto, sem confirmação', async () => {
      let corpo: Corpo = {};
      const fetchMock = api({
        rotas: {
          [`${API}/${ID_1}/status`]: (init) => {
            corpo = corpoDe(init);
            return json(profissional({ ativo: true }));
          },
        },
      });
      const { user } = renderTela(fetchMock);
      await screen.findByText('Ana Teste');

      await abrirMenuDaLinha(user, 0);
      await user.click(await screen.findByRole('menuitem', { name: 'Ativar' }));

      await waitFor(() => expect(corpo).toEqual({ ativo: true }));
    });

    it('Desativar pede confirmação e envia ativo=false', async () => {
      let corpo: Corpo = {};
      const fetchMock = api({
        rotas: {
          [`${API}/${ID_2}/status`]: (init) => {
            corpo = corpoDe(init);
            return json(profissional({ id: ID_2, ativo: false }));
          },
        },
      });
      const { user } = renderTela(fetchMock);
      await screen.findByText('Bruno Teste');

      await abrirMenuDaLinha(user, 1);
      await user.click(await screen.findByRole('menuitem', { name: 'Desativar' }));
      const dialogo = await screen.findByRole('alertdialog', { name: 'Desativar Profissional' });
      expect(corpo).toEqual({});
      await user.click(within(dialogo).getByRole('button', { name: 'Desativar' }));

      await waitFor(() => expect(corpo).toEqual({ ativo: false }));
    });

    it('Excluir pede confirmação com o texto do sistema atual e chama DELETE', async () => {
      let metodo = '';
      const fetchMock = api({
        rotas: {
          [`${API}/${ID_1}`]: (init) => {
            metodo = String(init?.method);
            return json(profissional({}));
          },
        },
      });
      const { user } = renderTela(fetchMock);
      await screen.findByText('Ana Teste');

      await abrirMenuDaLinha(user, 0);
      await user.click(await screen.findByRole('menuitem', { name: 'Excluir' }));
      const dialogo = await screen.findByRole('alertdialog', { name: 'Excluir Profissional' });
      expect(
        within(dialogo).getByText(
          'Tem certeza que deseja excluir o profissional "Ana Teste"? Esta ação não pode ser desfeita.',
        ),
      ).toBeVisible();
      expect(metodo).toBe('');
      await user.click(within(dialogo).getByRole('button', { name: 'Excluir' }));

      await waitFor(() => expect(metodo).toBe('DELETE'));
    });
  });

  describe('Bloqueios de Agenda', () => {
    const BLOQUEIO: BloqueioAgenda = {
      id: '00000000-0000-4000-8000-0000000000d1',
      dataInicio: '2026-11-02',
      dataFim: '2026-11-06',
      tipo: 'DIA_INTEIRO',
      horaInicio: null,
      horaFim: null,
      motivo: 'FERIAS',
      createdAt: AGORA,
    };

    async function abrirBloqueios(fetchMock: ReturnType<typeof api>) {
      const { user } = renderTela(fetchMock);
      await screen.findByText('Ana Teste');
      await abrirMenuDaLinha(user, 0);
      await user.click(await screen.findByRole('menuitem', { name: 'Bloqueios de Agenda' }));
      const modal = await screen.findByRole('dialog', { name: 'Bloqueios de Agenda — Ana Teste' });
      return { user, modal };
    }

    it('mostra Data Única e Lote, e "Nenhum bloqueio cadastrado."', async () => {
      const { user, modal } = await abrirBloqueios(
        api({ rotas: { [`${API}/${ID_1}/bloqueios`]: () => json({ data: [] }) } }),
      );

      expect(within(modal).getByRole('tab', { name: 'Data Única', selected: true })).toBeVisible();
      expect(within(modal).getByLabelText('Data')).toBeVisible();
      expect(within(modal).getByRole('radio', { name: 'Dia inteiro' })).toBeChecked();
      expect(within(modal).getByRole('radio', { name: 'Horário específico' })).not.toBeChecked();
      expect(await within(modal).findByText('Nenhum bloqueio cadastrado.')).toBeVisible();

      await user.click(within(modal).getByRole('tab', { name: 'Lote (período)' }));
      expect(within(modal).getByLabelText('Data Início')).toBeVisible();
      expect(within(modal).getByLabelText('Data Fim')).toBeVisible();
      expect(within(modal).queryByRole('radio')).not.toBeInTheDocument();

      await user.click(within(modal).getAllByRole('button', { name: 'Fechar' })[0] as HTMLElement);
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('Bloquear sem motivo e sem data mostra os erros e não envia', async () => {
      const fetchMock = api({ rotas: { [`${API}/${ID_1}/bloqueios`]: () => json({ data: [] }) } });
      const { user, modal } = await abrirBloqueios(fetchMock);

      await user.click(within(modal).getByRole('button', { name: 'Bloquear' }));

      expect(await within(modal).findByText('Data é obrigatória')).toBeVisible();
      // O texto "Selecione o motivo" também é o placeholder do select: um é o erro, o outro o placeholder.
      expect(within(modal).getAllByText('Selecione o motivo')).toHaveLength(2);
      expect(
        chamadasPara(fetchMock, `${API}/${ID_1}/bloqueios`).filter(([, i]) => i?.method === 'POST'),
      ).toHaveLength(0);
    });

    it('Data Única com horário específico mostra as horas e envia o bloqueio', async () => {
      let corpo: Corpo = {};
      const fetchMock = api({
        rotas: {
          [`${API}/${ID_1}/bloqueios`]: (init) => {
            if (ehLeitura(init)) return json({ data: [] });
            corpo = corpoDe(init);
            return json(BLOQUEIO, 201);
          },
        },
      });
      const { user, modal } = await abrirBloqueios(fetchMock);

      await user.type(within(modal).getByLabelText('Data'), '2026-11-10');
      await user.click(within(modal).getByRole('radio', { name: 'Horário específico' }));
      await user.type(within(modal).getByLabelText('Hora inicial'), '0800');
      await user.type(within(modal).getByLabelText('Hora final'), '1000');
      await user.click(within(modal).getByRole('combobox', { name: 'Motivo' }));
      await user.click(await screen.findByRole('option', { name: 'Reunião' }));
      await user.click(within(modal).getByRole('button', { name: 'Bloquear' }));

      await waitFor(() =>
        expect(corpo).toMatchObject({
          dataInicio: '2026-11-10',
          tipo: 'HORARIO',
          horaInicio: '08:00',
          horaFim: '10:00',
          motivo: 'REUNIAO',
        }),
      );
    });

    it('lista os bloqueios ativos e remove um, com confirmação', async () => {
      let removido = '';
      const fetchMock = api({
        rotas: {
          [`${API}/${ID_1}/bloqueios`]: () => json({ data: [BLOQUEIO] }),
          [`${API}/${ID_1}/bloqueios/${BLOQUEIO.id}`]: (init) => {
            removido = String(init?.method);
            return json(BLOQUEIO);
          },
        },
      });
      const { user, modal } = await abrirBloqueios(fetchMock);

      expect(await within(modal).findByText('02/11/2026 a 06/11/2026')).toBeVisible();
      expect(within(within(modal).getByRole('list')).getByText('Férias')).toBeVisible();
      await user.click(
        within(modal).getByRole('button', { name: 'Remover bloqueio de 02/11/2026 a 06/11/2026' }),
      );
      const dialogo = await screen.findByRole('alertdialog', { name: 'Remover bloqueio' });
      await user.click(within(dialogo).getByRole('button', { name: 'Remover' }));

      await waitFor(() => expect(removido).toBe('DELETE'));
    });
  });

  describe('Gerenciar Especialidades', () => {
    const ESPECIALIDADES: Especialidade[] = [
      { id: ESP, nome: 'Acupuntura', createdAt: AGORA, updatedAt: AGORA },
      {
        id: '00000000-0000-4000-8000-0000000000c2',
        nome: 'Pediatria',
        createdAt: AGORA,
        updatedAt: AGORA,
      },
    ];

    async function abrir(fetchMock: ReturnType<typeof api>) {
      const { user } = renderTela(fetchMock);
      await screen.findByText('Ana Teste');
      await user.click(screen.getByRole('button', { name: 'Especialidades' }));
      const modal = await screen.findByRole('dialog', { name: 'Gerenciar Especialidades' });
      return { user, modal };
    }

    it('lista as especialidades com editar e excluir', async () => {
      const { modal } = await abrir(
        api({ rotas: { [API_ESPECIALIDADES]: () => pagina(ESPECIALIDADES) } }),
      );

      expect(await within(modal).findByText('Acupuntura')).toBeVisible();
      expect(within(modal).getByText('Pediatria')).toBeVisible();
      expect(within(modal).getByPlaceholderText('Nova especialidade...')).toBeVisible();
      expect(within(modal).getByRole('button', { name: 'Editar Pediatria' })).toBeVisible();
      expect(within(modal).getByRole('button', { name: 'Excluir Pediatria' })).toBeVisible();
    });

    it('Adicionar envia o nome, limpa o campo; vazio mostra o erro; repetido mostra a mensagem do servidor', async () => {
      const corpos: Corpo[] = [];
      const fetchMock = api({
        rotas: {
          [API_ESPECIALIDADES]: (init) => {
            if (ehLeitura(init)) return pagina(ESPECIALIDADES);
            const corpo = corpoDe(init);
            corpos.push(corpo);
            return corpo.nome === 'Repetida'
              ? json(
                  {
                    statusCode: 409,
                    code: 'ESPECIALIDADE_DUPLICADA',
                    message: 'Esta especialidade já existe.',
                  },
                  409,
                )
              : json({ ...ESPECIALIDADES[0], nome: 'Cardiologia' }, 201);
          },
        },
      });
      const { user, modal } = await abrir(fetchMock);
      await within(modal).findByText('Acupuntura');

      await user.click(within(modal).getByRole('button', { name: 'Adicionar' }));
      expect(await within(modal).findByText('Informe o nome da especialidade')).toBeVisible();
      expect(corpos).toHaveLength(0);

      const campo = within(modal).getByPlaceholderText('Nova especialidade...');
      await user.type(campo, 'Cardiologia');
      await user.click(within(modal).getByRole('button', { name: 'Adicionar' }));
      await waitFor(() => expect(corpos).toEqual([{ nome: 'Cardiologia' }]));
      await waitFor(() => expect(campo).toHaveValue(''));

      await user.type(campo, 'Repetida');
      await user.click(within(modal).getByRole('button', { name: 'Adicionar' }));
      expect(await within(modal).findByText('Esta especialidade já existe.')).toBeVisible();
    });

    it('renomeia e exclui (com confirmação; mostra o bloqueio quando está em uso)', async () => {
      let renomeado: Corpo = {};
      const fetchMock = api({
        rotas: {
          [API_ESPECIALIDADES]: () => pagina(ESPECIALIDADES),
          [`${API_ESPECIALIDADES}/${ESP}`]: (init) => {
            if (init?.method === 'PATCH') {
              renomeado = corpoDe(init);
              return json({ ...ESPECIALIDADES[0], nome: 'Acupuntura 2' });
            }
            return json(
              {
                statusCode: 409,
                code: 'ESPECIALIDADE_EM_USO',
                message:
                  'Esta especialidade está em uso por 2 profissional(is) e não pode ser excluída.',
              },
              409,
            );
          },
        },
      });
      const { user, modal } = await abrir(fetchMock);
      await within(modal).findByText('Acupuntura');

      await user.click(within(modal).getByRole('button', { name: 'Editar Acupuntura' }));
      const campo = within(modal).getByLabelText('Nome de Acupuntura');
      await user.clear(campo);
      await user.type(campo, 'Acupuntura 2');
      await user.click(within(modal).getByRole('button', { name: 'Salvar nome' }));
      await waitFor(() => expect(renomeado).toEqual({ nome: 'Acupuntura 2' }));

      await user.click(within(modal).getByRole('button', { name: 'Excluir Acupuntura' }));
      const dialogo = await screen.findByRole('alertdialog', { name: 'Excluir especialidade' });
      await user.click(within(dialogo).getByRole('button', { name: 'Excluir' }));
      expect(await screen.findByText(/está em uso por 2 profissional/)).toBeVisible();
    });
  });

  describe('Horários de Atendimento (modal Editar)', () => {
    const HORARIO: HorarioAtendimento = {
      id: '00000000-0000-4000-8000-0000000000e1',
      tipo: 'SEMANAL',
      diaSemana: 4,
      data: null,
      inicio: '13:30',
      fim: '18:00',
      almocoInicio: null,
      almocoFim: null,
    };

    async function abrirEdicao(fetchMock: ReturnType<typeof api>) {
      const { user } = renderTela(fetchMock);
      await screen.findByText('Ana Teste');
      await abrirMenuDaLinha(user, 0);
      await user.click(await screen.findByRole('menuitem', { name: 'Editar' }));
      const modal = await screen.findByRole('dialog', { name: 'Editar Profissional' });
      await within(modal).findByText('Horários de Atendimento');
      return { user, modal };
    }

    it('mostra os horários semanais salvos e alterna para Por Data', async () => {
      const { user, modal } = await abrirEdicao(
        api({ rotas: { [`${API}/${ID_1}/horarios`]: () => json({ data: [HORARIO] }) } }),
      );

      expect(await within(modal).findByLabelText('Início')).toHaveValue('13:30');
      expect(within(modal).getByLabelText('Fim')).toHaveValue('18:00');
      expect(within(modal).getByRole('combobox', { name: 'Dia' })).toHaveTextContent('Quinta');

      await user.click(within(modal).getByRole('tab', { name: 'Por Data' }));
      expect(within(modal).getByText('Nenhum horário por data cadastrado.')).toBeVisible();
    });

    it('Adicionar Dia + Salvar Horários valida e envia a lista inteira (PUT)', async () => {
      let corpo: { horarios?: Corpo[] } = {};
      const fetchMock = api({
        rotas: {
          [`${API}/${ID_1}/horarios`]: (init) => {
            if (ehLeitura(init)) return json({ data: [] });
            corpo = corpoDe(init) as typeof corpo;
            return json({ id: ID_1, horarios: [] });
          },
        },
      });
      const { user, modal } = await abrirEdicao(fetchMock);

      await user.click(within(modal).getByRole('button', { name: 'Adicionar Dia' }));
      await user.click(within(modal).getByRole('button', { name: 'Salvar Horários' }));
      expect(await within(modal).findByText('Selecione o dia')).toBeVisible();
      expect(corpo.horarios).toBeUndefined();

      await user.click(within(modal).getByRole('combobox', { name: 'Dia' }));
      await user.click(await screen.findByRole('option', { name: 'Segunda' }));
      fireEvent.change(within(modal).getByLabelText('Início'), { target: { value: '08:00' } });
      fireEvent.change(within(modal).getByLabelText('Fim'), { target: { value: '12:00' } });
      await user.click(within(modal).getByRole('button', { name: 'Salvar Horários' }));

      await waitFor(() =>
        expect(corpo.horarios).toEqual([
          expect.objectContaining({
            tipo: 'SEMANAL',
            diaSemana: 1,
            inicio: '08:00',
            fim: '12:00',
          }),
        ]),
      );
    }, 20_000);

    it('mostra o erro de fim antes do início e remove uma linha', async () => {
      const { user, modal } = await abrirEdicao(
        api({ rotas: { [`${API}/${ID_1}/horarios`]: () => json({ data: [HORARIO] }) } }),
      );
      await within(modal).findByLabelText('Início');

      const fim = within(modal).getByLabelText('Fim');
      await user.clear(fim);
      await user.type(fim, '1000');
      await user.click(within(modal).getByRole('button', { name: 'Salvar Horários' }));
      expect(await within(modal).findByText('O fim deve ser depois do início')).toBeVisible();

      await user.click(within(modal).getByRole('button', { name: 'Remover horário' }));
      expect(within(modal).getByText('Nenhum horário semanal cadastrado.')).toBeVisible();
    });
  });

  it('sem permissão de criar/editar/excluir, a tela só lista', async () => {
    renderTela(
      api({
        usuario: {
          ...USUARIO_TESTE,
          permissoes: PERMISSOES.filter((p) => p === 'gestao-profissionais.profissionais.ver'),
        },
      }),
    );

    expect(await screen.findByText('Ana Teste')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Novo Profissional' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exportar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tipos de Agendamento' })).not.toBeInTheDocument();
  });
});

describe('formatadores', () => {
  it('iniciais, valor e comissão', () => {
    expect(iniciaisDe('ana luiza cardoso silva')).toBe('AS');
    expect(iniciaisDe('Bruno')).toBe('B');
    expect(formatarValor(600)).toMatch(/R\$\s*600,00/);
    expect(formatarValor(null)).toBe('-');
    expect(formatarComissao(12.5)).toBe('12,5%');
    expect(formatarComissao(0)).toBe('-');
    expect(formatarComissao(null)).toBe('-');
  });
});
