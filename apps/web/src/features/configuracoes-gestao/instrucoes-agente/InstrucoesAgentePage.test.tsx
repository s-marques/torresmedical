import type {
  AgenteAlertaDestino,
  AgenteInstrucao,
  AgenteInstrucaoExtra,
  AgenteInstrucaoVersao,
  AgenteRegra,
} from '@torres/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { apiFalsa, chamadasPara, json, renderApp } from '@/test/render-app';

vi.setConfig({ testTimeout: 20_000 });

const RAIZ = '/api/configuracoes-gestao';
const INSTRUCOES = `${RAIZ}/agente-instrucoes`;
const EXTRAS = `${RAIZ}/agente-instrucoes-extras`;
const DESTINOS = `${RAIZ}/agente-alertas-destinos`;
const REGRAS = `${RAIZ}/agente-regras`;
const ID = '00000000-0000-4000-8000-0000000000a1';
const ID_2 = '00000000-0000-4000-8000-0000000000a2';
const DATA = '2026-11-19T12:00:00.000Z';

function instrucao(parcial: Partial<AgenteInstrucao> = {}): AgenteInstrucao {
  return {
    id: ID,
    nome: 'Atendimento Teste',
    modelo: 'gpt-4.1-mini',
    temperatura: 0.7,
    maxTokens: 1500,
    ativo: false,
    systemPrompt: 'Você é um assistente.\nSeja cordial.',
    status: 'RASCUNHO',
    versaoAtual: 1,
    aprovadoPor: null,
    aprovadoPorNome: null,
    aprovadoEm: null,
    createdAt: DATA,
    updatedAt: DATA,
    ...parcial,
  };
}

const EXTRA: AgenteInstrucaoExtra = {
  id: ID,
  titulo: 'Voucher teste',
  descricao: 'Texto da promoção de teste.',
  ativo: true,
  createdAt: DATA,
  updatedAt: DATA,
};

const DESTINO: AgenteAlertaDestino = {
  id: ID,
  tipo: 'NUMERO',
  nome: 'Recepção Teste',
  numero: '5565999990001',
  createdAt: DATA,
};

const REGRA: AgenteRegra = {
  id: ID,
  nome: 'uma_pergunta_por_vez',
  descricao: 'Limita a uma pergunta por mensagem.',
  tipo: 'POS_RESPOSTA',
  gatilho: 'qualquer',
  acao: 'BLOQUEAR',
  ativo: true,
  createdAt: DATA,
  updatedAt: DATA,
};

function pagina<T>(data: T[]) {
  return json({ data, meta: { page: 1, pageSize: 100, total: data.length, totalPages: 1 } });
}

type Corpo = Record<string, unknown>;
const corpoDe = (init?: RequestInit): Corpo => JSON.parse(String(init?.body)) as Corpo;

function api(rotas: Parameters<typeof apiFalsa>[0] = {}) {
  return apiFalsa({
    ...rotas,
    rotas: {
      [INSTRUCOES]: () => pagina([instrucao()]),
      [EXTRAS]: () => pagina([EXTRA]),
      [DESTINOS]: () => pagina([DESTINO]),
      [REGRAS]: () => pagina([REGRA]),
      ...rotas.rotas,
    },
  });
}

async function abrirAba(nome: string) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('tab', { name: nome }));
  return user;
}

function renderTela(fetchMock = api()) {
  return { user: userEvent.setup(), ...renderApp('/agentes-ia/instrucoes', fetchMock) };
}

describe('Instruções Agente (/agentes-ia/instrucoes)', () => {
  it('mostra título, as quatro abas e a regra fixa', async () => {
    renderTela();
    expect(
      await screen.findByRole('heading', { name: 'Instruções do Agente IA' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Instruções',
      'Instruções Extras',
      'Alertas do Agente',
      'Regras',
    ]);
    expect(
      await screen.findByText(/não faz diagnóstico, prescrição nem decisões clínicas/),
    ).toBeVisible();
  });

  describe('aba Instruções', () => {
    it('lista o card com modelo, status, temperatura, tokens e versão', async () => {
      renderTela();
      expect(await screen.findByText('Atendimento Teste')).toBeVisible();
      expect(screen.getByText('1 instrução configurada')).toBeVisible();
      expect(screen.getByText('gpt-4.1-mini')).toBeVisible();
      expect(screen.getByText('Rascunho')).toBeVisible();
      expect(screen.getByText('Inativo')).toBeVisible();
      expect(screen.getByText(/Temp: 0.7 \| Tokens: 1500 \| Versão 1/)).toBeVisible();
      expect(screen.getByRole('button', { name: 'Nova Instrução' })).toBeVisible();
    });

    it('Nova Instrução: campos vazios mostram as mensagens e não enviam', async () => {
      const fetchMock = api();
      const { user } = renderTela(fetchMock);
      await screen.findByText('Atendimento Teste');

      await user.click(screen.getByRole('button', { name: 'Nova Instrução' }));
      const modal = await screen.findByRole('dialog', { name: 'Nova Instrução' });
      expect(within(modal).getByLabelText(/Modelo/)).toHaveValue('gpt-4.1-mini');
      expect(within(modal).getByLabelText(/Temperatura/)).toHaveValue(0.7);
      expect(within(modal).getByLabelText(/Max Tokens/)).toHaveValue(1500);
      expect(within(modal).getByRole('switch', { name: 'Ativo' })).toBeDisabled();
      await user.click(within(modal).getByRole('button', { name: 'Criar' }));

      expect(await within(modal).findByText('Nome é obrigatório.')).toBeVisible();
      expect(within(modal).getByText('System Prompt é obrigatório.')).toBeVisible();
      expect(
        chamadasPara(fetchMock, INSTRUCOES).filter(([, i]) => i?.method === 'POST'),
      ).toHaveLength(0);
    });

    it('Nova Instrução: o botão do modelo recomendado preenche o campo e Criar envia o POST', async () => {
      let corpo: Corpo = {};
      const fetchMock = api({
        rotas: {
          [INSTRUCOES]: (init) => {
            if (init?.method !== 'POST') return pagina([instrucao()]);
            corpo = corpoDe(init);
            return json(instrucao({ id: ID_2 }), 201);
          },
        },
      });
      const { user } = renderTela(fetchMock);
      await screen.findByText('Atendimento Teste');

      await user.click(screen.getByRole('button', { name: 'Nova Instrução' }));
      const modal = await screen.findByRole('dialog', { name: 'Nova Instrução' });
      const modelo = within(modal).getByLabelText(/Modelo/);
      await user.clear(modelo);
      await user.click(within(modal).getByRole('button', { name: 'GPT-4.1 Mini (Recomendado)' }));
      expect(modelo).toHaveValue('gpt-4.1-mini');
      await user.type(within(modal).getByLabelText(/Nome/), 'Nova');
      await user.type(within(modal).getByLabelText(/System Prompt/), 'Prompt novo');
      await user.click(within(modal).getByRole('button', { name: 'Criar' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(corpo).toMatchObject({
        nome: 'Nova',
        modelo: 'gpt-4.1-mini',
        temperatura: 0.7,
        maxTokens: 1500,
        ativo: false,
        systemPrompt: 'Prompt novo',
      });
    });

    it('Editar: abre com os dados atuais e envia PATCH', async () => {
      let corpo: Corpo = {};
      const { user } = renderTela(
        api({
          rotas: {
            [`${INSTRUCOES}/${ID}`]: (init) => {
              corpo = corpoDe(init);
              return json(instrucao());
            },
          },
        }),
      );
      await screen.findByText('Atendimento Teste');

      await user.click(screen.getByRole('button', { name: 'Editar Atendimento Teste' }));
      const modal = await screen.findByRole('dialog', { name: 'Editar Instrução' });
      expect(within(modal).getByLabelText(/Nome/)).toHaveValue('Atendimento Teste');
      const nome = within(modal).getByLabelText(/Nome/);
      await user.clear(nome);
      await user.type(nome, 'Outro nome');
      await user.click(within(modal).getByRole('button', { name: 'Salvar' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(corpo).toMatchObject({ nome: 'Outro nome', ativo: false });
    });

    it('Excluir pede confirmação, e Cancelar não exclui', async () => {
      const fetchMock = api();
      const { user } = renderTela(fetchMock);
      await screen.findByText('Atendimento Teste');

      await user.click(screen.getByRole('button', { name: 'Excluir Atendimento Teste' }));
      const dialogo = await screen.findByRole('alertdialog');
      await user.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(chamadasPara(fetchMock, `${INSTRUCOES}/${ID}`)).toHaveLength(0);
    });

    it('Excluir confirmado envia DELETE', async () => {
      const metodos: (string | undefined)[] = [];
      const { user } = renderTela(
        api({
          rotas: {
            [`${INSTRUCOES}/${ID}`]: (init) => {
              metodos.push(init?.method);
              return json(instrucao());
            },
          },
        }),
      );
      await screen.findByText('Atendimento Teste');
      await user.click(screen.getByRole('button', { name: 'Excluir Atendimento Teste' }));
      const dialogo = await screen.findByRole('alertdialog');
      await user.click(within(dialogo).getByRole('button', { name: 'Excluir' }));
      await waitFor(() => expect(metodos).toEqual(['DELETE']));
    });

    it('ciclo de aprovação: oferece só a próxima etapa e envia o novo status', async () => {
      const corpos: Corpo[] = [];
      const { user } = renderTela(
        api({
          rotas: {
            [`${INSTRUCOES}/${ID}/status`]: (init) => {
              corpos.push(corpoDe(init));
              return json(instrucao({ status: 'EM_TESTE' }));
            },
          },
        }),
      );
      await screen.findByText('Atendimento Teste');
      expect(screen.queryByRole('button', { name: 'Publicar' })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Enviar para teste' }));
      await waitFor(() => expect(corpos).toEqual([{ status: 'EM_TESTE' }]));
    });

    it('mostra quem aprovou e oferece publicar quando está aprovada', async () => {
      renderTela(
        api({
          rotas: {
            [INSTRUCOES]: () =>
              pagina([
                instrucao({
                  status: 'APROVADO',
                  aprovadoPor: ID_2,
                  aprovadoPorNome: 'Dra. Teste',
                  aprovadoEm: DATA,
                }),
              ]),
          },
        }),
      );
      expect(await screen.findByText(/Aprovada por Dra\. Teste/)).toBeVisible();
      expect(screen.getByRole('button', { name: 'Publicar' })).toBeVisible();
      expect(screen.getByRole('button', { name: 'Voltar para rascunho' })).toBeVisible();
    });

    it('histórico de versões: compara com a anterior e restaura uma versão', async () => {
      const versoes: AgenteInstrucaoVersao[] = [2, 1].map((numero) => ({
        id: `00000000-0000-4000-8000-00000000000${numero}`,
        numero,
        nome: 'Atendimento Teste',
        modelo: 'gpt-4.1-mini',
        temperatura: 0.7,
        maxTokens: 1500,
        systemPrompt: numero === 2 ? 'Linha A\nLinha nova' : 'Linha A\nLinha antiga',
        criadoPor: null,
        criadoPorNome: 'Dra. Teste',
        createdAt: DATA,
      }));
      let restaurou = false;
      const { user } = renderTela(
        api({
          rotas: {
            [INSTRUCOES]: () => pagina([instrucao({ versaoAtual: 2 })]),
            [`${INSTRUCOES}/${ID}/versoes`]: () => json(versoes),
            [`${INSTRUCOES}/${ID}/versoes/1/restaurar`]: () => {
              restaurou = true;
              return json(instrucao({ versaoAtual: 3 }));
            },
          },
        }),
      );
      await screen.findByText('Atendimento Teste');

      await user.click(
        screen.getByRole('button', { name: 'Histórico de versões de Atendimento Teste' }),
      );
      const modal = await screen.findByRole('dialog');
      expect(await within(modal).findByText('Versão 2 comparada à versão 1')).toBeVisible();
      expect(within(modal).getByText(/\+ Linha nova/)).toBeVisible();
      expect(within(modal).getByText(/- Linha antiga/)).toBeVisible();
      expect(
        within(modal).queryByRole('button', { name: 'Restaurar esta versão' }),
      ).not.toBeInTheDocument();

      await user.click(within(modal).getByRole('button', { name: /Versão 1/ }));
      await user.click(within(modal).getByRole('button', { name: 'Restaurar esta versão' }));
      await waitFor(() => expect(restaurou).toBe(true));
    });
  });

  describe('aba Instruções Extras', () => {
    it('lista os cards e o texto de apoio', async () => {
      renderTela();
      await abrirAba('Instruções Extras');
      expect(await screen.findByText('Voucher teste')).toBeVisible();
      expect(screen.getByText('Texto da promoção de teste.')).toBeVisible();
      expect(screen.getByText(/são injetadas automaticamente no prompt do agente/)).toBeVisible();
      expect(screen.getByRole('switch', { name: 'Desativar Voucher teste' })).toBeChecked();
    });

    it('Nova Instrução Extra: valida os obrigatórios e envia o POST', async () => {
      let corpo: Corpo = {};
      const fetchMock = api({
        rotas: {
          [EXTRAS]: (init) => {
            if (init?.method !== 'POST') return pagina([EXTRA]);
            corpo = corpoDe(init);
            return json({ ...EXTRA, id: ID_2 }, 201);
          },
        },
      });
      renderTela(fetchMock);
      const user = await abrirAba('Instruções Extras');
      await screen.findByText('Voucher teste');

      await user.click(screen.getByRole('button', { name: 'Nova Instrução Extra' }));
      const modal = await screen.findByRole('dialog', { name: 'Nova Instrução Extra' });
      await user.click(within(modal).getByRole('button', { name: 'Criar' }));
      expect(await within(modal).findByText('Título é obrigatório.')).toBeVisible();
      expect(within(modal).getByText('Descrição é obrigatória.')).toBeVisible();

      await user.type(within(modal).getByLabelText(/Título/), 'Nova promo');
      await user.type(within(modal).getByLabelText(/Descrição/), 'Detalhes da promo');
      await user.click(within(modal).getByRole('button', { name: 'Criar' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(corpo).toEqual({ titulo: 'Nova promo', descricao: 'Detalhes da promo', ativo: true });
    });

    it('interruptor liga e desliga; Excluir confirma antes de enviar DELETE', async () => {
      const chamadas: string[] = [];
      renderTela(
        api({
          rotas: {
            [`${EXTRAS}/${ID}/ativo`]: (init) => {
              chamadas.push(`ativo ${String(corpoDe(init).ativo)}`);
              return json({ ...EXTRA, ativo: false });
            },
            [`${EXTRAS}/${ID}`]: (init) => {
              chamadas.push(String(init?.method));
              return json(EXTRA);
            },
          },
        }),
      );
      const user = await abrirAba('Instruções Extras');
      await user.click(await screen.findByRole('switch', { name: 'Desativar Voucher teste' }));
      await waitFor(() => expect(chamadas).toEqual(['ativo false']));

      await user.click(screen.getByRole('button', { name: 'Excluir Voucher teste' }));
      const dialogo = await screen.findByRole('alertdialog');
      await user.click(within(dialogo).getByRole('button', { name: 'Excluir' }));
      await waitFor(() => expect(chamadas).toEqual(['ativo false', 'DELETE']));
    });
  });

  describe('aba Alertas do Agente', () => {
    it('lista os destinos com o número formatado e o formulário de adicionar', async () => {
      renderTela();
      await abrirAba('Alertas do Agente');
      expect(await screen.findByText('Recepção Teste')).toBeVisible();
      expect(screen.getByText('(65) 99999-0001')).toBeVisible();
      expect(screen.getByText('whatsapp')).toBeVisible();
      expect(screen.getByText('Destinos de Notificação')).toBeVisible();
      expect(screen.getByLabelText('Tipo')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Adicionar' })).toBeVisible();
    });

    it('Adicionar: valida o formulário e envia o POST', async () => {
      let corpo: Corpo = {};
      renderTela(
        api({
          rotas: {
            [DESTINOS]: (init) => {
              if (init?.method !== 'POST') return pagina([DESTINO]);
              corpo = corpoDe(init);
              return json({ ...DESTINO, id: ID_2 }, 201);
            },
          },
        }),
      );
      const user = await abrirAba('Alertas do Agente');
      await screen.findByText('Recepção Teste');

      await user.click(screen.getByRole('button', { name: 'Adicionar' }));
      expect(await screen.findByText('Nome é obrigatório.')).toBeVisible();
      expect(screen.getByText('Número WhatsApp é obrigatório.')).toBeVisible();

      await user.type(screen.getByLabelText(/^Nome/), 'Gerência');
      await user.type(screen.getByLabelText(/Número WhatsApp/), '65999990002');
      await user.click(screen.getByRole('button', { name: 'Adicionar' }));
      await waitFor(() =>
        expect(corpo).toEqual({ tipo: 'NUMERO', nome: 'Gerência', numero: '5565999990002' }),
      );
    });

    it('Remover pede confirmação e envia DELETE', async () => {
      const metodos: (string | undefined)[] = [];
      renderTela(
        api({
          rotas: {
            [`${DESTINOS}/${ID}`]: (init) => {
              metodos.push(init?.method);
              return json(DESTINO);
            },
          },
        }),
      );
      const user = await abrirAba('Alertas do Agente');
      await user.click(await screen.findByRole('button', { name: 'Remover Recepção Teste' }));
      const dialogo = await screen.findByRole('alertdialog');
      await user.click(within(dialogo).getByRole('button', { name: 'Remover' }));
      await waitFor(() => expect(metodos).toEqual(['DELETE']));
    });
  });

  describe('aba Regras', () => {
    it('mostra a grid com Nome, Tipo, Gatilho, Ação, Ativo e Ações e o resumo', async () => {
      const fetchMock = api();
      renderTela(fetchMock);
      await abrirAba('Regras');

      const cabecalhos = within(await screen.findByRole('table')).getAllByRole('columnheader');
      expect(cabecalhos.map((c) => c.textContent)).toEqual([
        'Nome',
        'Tipo',
        'Gatilho',
        'Ação',
        'Ativo',
        'Ações',
      ]);
      expect(await screen.findByText('uma_pergunta_por_vez')).toBeVisible();
      expect(screen.getByText('Limita a uma pergunta por mensagem.')).toBeVisible();
      expect(screen.getByText('Pós-resposta')).toBeVisible();
      expect(screen.getByText('bloquear')).toBeVisible();
      expect(screen.getByText('1 regra configurada')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Nova Regra' })).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Gerar com IA' })).not.toBeInTheDocument();
    });

    it('ordenar e buscar chamam a API com sort e search', async () => {
      const fetchMock = api();
      renderTela(fetchMock);
      const user = await abrirAba('Regras');
      await screen.findByText('uma_pergunta_por_vez');

      await user.click(screen.getByRole('button', { name: 'Nome' }));
      await waitFor(() => {
        const [url] = chamadasPara(fetchMock, REGRAS).at(-1) ?? [''];
        expect(new URL(url, 'http://x').searchParams.get('sort')).toBe('nome:asc');
      });
      await user.type(screen.getByPlaceholderText('Buscar por nome ou descrição...'), 'valor');
      await waitFor(() => {
        const [url] = chamadasPara(fetchMock, REGRAS).at(-1) ?? [''];
        expect(new URL(url, 'http://x').searchParams.get('search')).toBe('valor');
      });
    });

    it('Nova Regra: valida e envia o POST', async () => {
      let corpo: Corpo = {};
      renderTela(
        api({
          rotas: {
            [REGRAS]: (init) => {
              if (init?.method !== 'POST') return pagina([REGRA]);
              corpo = corpoDe(init);
              return json({ ...REGRA, id: ID_2 }, 201);
            },
          },
        }),
      );
      const user = await abrirAba('Regras');
      await screen.findByText('uma_pergunta_por_vez');

      await user.click(screen.getByRole('button', { name: 'Nova Regra' }));
      const modal = await screen.findByRole('dialog', { name: 'Nova Regra' });
      await user.click(within(modal).getByRole('button', { name: 'Criar' }));
      expect(await within(modal).findByText('Nome é obrigatório.')).toBeVisible();
      expect(within(modal).getByText('Descrição é obrigatória.')).toBeVisible();

      await user.type(within(modal).getByLabelText(/Nome/), 'regra_nova');
      await user.type(within(modal).getByLabelText(/Descrição/), 'Descrição da regra');
      await user.click(within(modal).getByRole('button', { name: 'Criar' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(corpo).toEqual({
        nome: 'regra_nova',
        descricao: 'Descrição da regra',
        tipo: 'POS_RESPOSTA',
        gatilho: 'qualquer',
        acao: 'BLOQUEAR',
        ativo: true,
      });
    });

    it('Editar envia PATCH; interruptor e Excluir chamam a API', async () => {
      const chamadas: string[] = [];
      renderTela(
        api({
          rotas: {
            [`${REGRAS}/${ID}/ativo`]: (init) => {
              chamadas.push(`ativo ${String(corpoDe(init).ativo)}`);
              return json({ ...REGRA, ativo: false });
            },
            [`${REGRAS}/${ID}`]: (init) => {
              chamadas.push(
                `${String(init?.method)} ${init?.body ? String(corpoDe(init).descricao) : ''}`.trim(),
              );
              return json(REGRA);
            },
          },
        }),
      );
      const user = await abrirAba('Regras');
      await user.click(
        await screen.findByRole('switch', { name: 'Desativar regra uma_pergunta_por_vez' }),
      );
      await waitFor(() => expect(chamadas).toEqual(['ativo false']));

      await user.click(screen.getByRole('button', { name: 'Editar regra uma_pergunta_por_vez' }));
      const modal = await screen.findByRole('dialog', { name: 'Editar Regra' });
      const descricao = within(modal).getByLabelText(/Descrição/);
      await user.clear(descricao);
      await user.type(descricao, 'Nova descrição');
      await user.click(within(modal).getByRole('button', { name: 'Salvar' }));
      await waitFor(() => expect(chamadas).toContain('PATCH Nova descrição'));

      await user.click(screen.getByRole('button', { name: 'Excluir regra uma_pergunta_por_vez' }));
      const dialogo = await screen.findByRole('alertdialog');
      await user.click(within(dialogo).getByRole('button', { name: 'Excluir' }));
      await waitFor(() => expect(chamadas.at(-1)).toBe('DELETE'));
    });
  });

  it('sem permissão de editar, criar e excluir: esconde os botões de escrita', async () => {
    const { USUARIO_TESTE } = await import('@/test/render-app');
    renderTela(
      api({
        usuario: {
          ...USUARIO_TESTE,
          permissoes: USUARIO_TESTE.permissoes.filter(
            (p) =>
              p === 'configuracoes-gestao.instrucoes-agente.ver' ||
              !p.startsWith('configuracoes-gestao.instrucoes-agente.'),
          ),
        },
      }),
    );
    expect(await screen.findByText('Atendimento Teste')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Nova Instrução' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Editar Atendimento Teste' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Excluir Atendimento Teste' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar para teste' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Histórico de versões de Atendimento Teste' }),
    ).toBeVisible();
  });
});
