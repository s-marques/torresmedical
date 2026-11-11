import { describe, expect, it } from 'vitest';
import '../../zod-pt-br';
import {
  contadoresConversasWhatsappQuerySchema,
  listConversasWhatsappQuerySchema,
  normalizarTelefoneWhatsapp,
  novaConversaWhatsappSchema,
} from './conversa-whatsapp';

const UUID = '00000000-0000-4000-8000-000000000001';

function messages(result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((i) => [i.path.join('.') || '_', i.message]),
  );
}

describe('listConversasWhatsappQuerySchema', () => {
  it('padrão: mais recentes primeiro, sem filtros', () => {
    expect(listConversasWhatsappQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 10,
      sort: { field: 'ultimaMensagemEm', direction: 'desc' },
      search: undefined,
    });
  });

  it('aceita status, canal e busca com 2 caracteres ou mais', () => {
    expect(
      listConversasWhatsappQuerySchema.parse({
        status: 'em-atendimento',
        canalId: UUID,
        search: ' ab ',
      }),
    ).toMatchObject({ status: 'em-atendimento', canalId: UUID, search: 'ab' });
  });

  it('busca com 1 caractere: "Digite pelo menos 2 caracteres"; vazia vira ausente', () => {
    expect(messages(listConversasWhatsappQuerySchema.safeParse({ search: 'a' }))).toEqual({
      search: 'Digite pelo menos 2 caracteres',
    });
    expect(listConversasWhatsappQuerySchema.parse({ search: '  ' }).search).toBeUndefined();
  });

  it('rejeita status e canal inválidos', () => {
    expect(
      messages(listConversasWhatsappQuerySchema.safeParse({ status: 'alertas', canalId: 'x' })),
    ).toEqual({
      status: 'Status deve ser bot, aguardando, em-atendimento ou finalizada',
      canalId: 'Canal inválido',
    });
  });
});

describe('contadoresConversasWhatsappQuerySchema', () => {
  it('canal opcional', () => {
    expect(contadoresConversasWhatsappQuerySchema.parse({})).toEqual({});
    expect(contadoresConversasWhatsappQuerySchema.safeParse({ canalId: 'x' }).success).toBe(false);
  });
});

describe('novaConversaWhatsappSchema', () => {
  it('paciente e canal obrigatórios', () => {
    expect(messages(novaConversaWhatsappSchema.safeParse({ pacienteId: null }))).toEqual({
      pacienteId: 'Paciente é obrigatório.',
      canalId: 'Canal é obrigatório.',
    });
    expect(novaConversaWhatsappSchema.parse({ pacienteId: UUID, canalId: UUID })).toEqual({
      pacienteId: UUID,
      canalId: UUID,
    });
  });

  it('não aceita campos extras', () => {
    expect(
      novaConversaWhatsappSchema.safeParse({ pacienteId: UUID, canalId: UUID, x: 1 }).success,
    ).toBe(false);
  });
});

describe('normalizarTelefoneWhatsapp', () => {
  it('acrescenta o DDI 55 a números com DDD e mantém os já completos', () => {
    expect(normalizarTelefoneWhatsapp('(65) 99999-0000')).toBe('5565999990000');
    expect(normalizarTelefoneWhatsapp('6533330000')).toBe('556533330000');
    expect(normalizarTelefoneWhatsapp('+55 65 99999-0000')).toBe('5565999990000');
    expect(normalizarTelefoneWhatsapp('999990000')).toBe('999990000');
  });
});
