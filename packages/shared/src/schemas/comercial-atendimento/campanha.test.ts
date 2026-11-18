import { describe, expect, it } from 'vitest';
import {
  aplicarVariaveis,
  campanhaInputSchema,
  destinatariosQuerySchema,
  listCampanhasQuerySchema,
  mascararTelefone,
  mensagemAutomaticaInputSchema,
} from './campanha';

const CANAL = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ORIGEM = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e60';

const mensagens = (
  schema: {
    safeParse: (d: unknown) => { error?: { issues: { path: PropertyKey[]; message: string }[] } };
  },
  dados: unknown,
) =>
  Object.fromEntries(
    (schema.safeParse(dados).error?.issues ?? []).map((i) => [i.path.join('.'), i.message]),
  );

describe('campanhaInputSchema', () => {
  it('formulário vazio: nome, canal e mensagem com a mensagem padrão', () => {
    expect(mensagens(campanhaInputSchema, {})).toEqual({
      nome: 'Nome da Campanha é obrigatório.',
      canalId: 'Canal WhatsApp é obrigatório.',
      mensagem: 'Mensagem é obrigatória.',
    });
  });

  it('padrões do modal: texto, todos os clientes, intervalo 5 s, sem data = agora', () => {
    expect(
      campanhaInputSchema.parse({
        nome: ' Promoção ',
        canalId: CANAL,
        mensagem: 'Olá {nome}',
        quantidade: null,
        data: '',
        hora: '',
      }),
    ).toEqual({
      nome: 'Promoção',
      tipoEnvio: 'TEXTO',
      canalId: CANAL,
      filtro: 'TODOS',
      origemClienteId: null,
      diasCompra: null,
      quantidade: null,
      intervaloSegundos: 5,
      data: null,
      hora: null,
      mensagem: 'Olá {nome}',
    });
  });

  it('data e hora andam juntas; filtro por origem e por compra pedem o campo', () => {
    const base = { nome: 'X', canalId: CANAL, mensagem: 'Y' };
    expect(mensagens(campanhaInputSchema, { ...base, data: '2026-12-01' })).toEqual({
      hora: 'Hora é obrigatória.',
    });
    expect(mensagens(campanhaInputSchema, { ...base, hora: '09:00' })).toEqual({
      data: 'Data é obrigatória.',
    });
    expect(mensagens(campanhaInputSchema, { ...base, filtro: 'ORIGEM' })).toEqual({
      origemClienteId: 'Origem é obrigatória.',
    });
    expect(mensagens(campanhaInputSchema, { ...base, filtro: 'COMPRA_RECENTE' })).toEqual({
      diasCompra: 'Dias desde a compra é obrigatório.',
    });
    expect(
      campanhaInputSchema.safeParse({ ...base, filtro: 'ORIGEM', origemClienteId: ORIGEM }).success,
    ).toBe(true);
  });

  it('rejeita quantidade, intervalo e hora fora da faixa', () => {
    expect(
      Object.keys(
        mensagens(campanhaInputSchema, {
          nome: 'X',
          canalId: CANAL,
          mensagem: 'Y',
          quantidade: 0,
          intervaloSegundos: 0,
          data: '2026-12-01',
          hora: '25:00',
        }),
      ).sort(),
    ).toEqual(['hora', 'intervaloSegundos', 'quantidade']);
  });
});

describe('mensagemAutomaticaInputSchema', () => {
  it('formulário vazio com as mensagens padrão', () => {
    expect(mensagens(mensagemAutomaticaInputSchema, {})).toEqual({
      nome: 'Nome é obrigatório.',
      canalId: 'Canal WhatsApp é obrigatório.',
      horario: 'Horário é obrigatório.',
      diasSemana: 'Dias da semana inválidos',
      mensagem: 'Mensagem é obrigatória.',
    });
    expect(
      mensagens(mensagemAutomaticaInputSchema, {
        nome: 'X',
        canalId: CANAL,
        horario: '09:00',
        diasSemana: [],
        mensagem: 'Y',
      }),
    ).toEqual({ diasSemana: 'Selecione ao menos um dia da semana.' });
  });

  it('ordena e deduplica os dias; ativa por padrão', () => {
    expect(
      mensagemAutomaticaInputSchema.parse({
        nome: 'Aniversariantes',
        canalId: CANAL,
        filtro: 'ANIVERSARIANTES_DIA',
        horario: '09:00',
        diasSemana: [6, 0, 6, 3],
        mensagem: 'Parabéns, {nome}!',
      }),
    ).toMatchObject({ diasSemana: [0, 3, 6], ativa: true, filtro: 'ANIVERSARIANTES_DIA' });
  });
});

describe('consultas', () => {
  it('lista por data do agendamento, mais recentes primeiro', () => {
    expect(listCampanhasQuerySchema.parse({}).sort).toEqual({
      field: 'agendadaPara',
      direction: 'desc',
    });
  });

  it('destinatários: filtro por origem exige a origem', () => {
    expect(destinatariosQuerySchema.parse({ diasCompra: '30', filtro: 'COMPRA_RECENTE' })).toEqual({
      page: 1,
      pageSize: 10,
      filtro: 'COMPRA_RECENTE',
      origemClienteId: null,
      diasCompra: 30,
    });
    expect(destinatariosQuerySchema.safeParse({ filtro: 'ORIGEM' }).success).toBe(false);
  });
});

describe('apoio', () => {
  it('mascara o telefone deixando DDD, primeiro dígito e final', () => {
    expect(mascararTelefone('5565999990000')).toBe('(65) 9****-0000');
    expect(mascararTelefone('(65) 3333-1234')).toBe('(65) 3****-1234');
    expect(mascararTelefone('123')).toBe('****');
  });

  it('troca as variáveis; sem última compra fica vazio', () => {
    expect(
      aplicarVariaveis('Oi {nome} ({telefone}), última: {ultima_compra}.', {
        nome: 'Ana',
        telefone: '(65) 99999-0000',
        ultimaCompra: null,
      }),
    ).toBe('Oi Ana ((65) 99999-0000), última: .');
  });
});
