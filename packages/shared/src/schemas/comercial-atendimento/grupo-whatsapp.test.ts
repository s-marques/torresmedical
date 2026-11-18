import { describe, expect, it } from 'vitest';
import { grupoWhatsappPageSchema, listGruposWhatsappQuerySchema } from './grupo-whatsapp';

const CANAL = '00000000-0000-4000-8000-0000000000c1';

describe('listGruposWhatsappQuerySchema', () => {
  it('exige o canal', () => {
    expect(listGruposWhatsappQuerySchema.safeParse({}).success).toBe(false);
  });

  it('rejeita canal que não é uuid', () => {
    const r = listGruposWhatsappQuerySchema.safeParse({ canalId: 'abc' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Canal inválido');
  });

  it('aplica os padrões de página e ordenação', () => {
    const r = listGruposWhatsappQuerySchema.parse({ canalId: CANAL });
    expect(r).toMatchObject({ page: 1, pageSize: 10, sort: { field: 'nome', direction: 'asc' } });
  });

  it('rejeita ordenação fora da whitelist', () => {
    expect(
      listGruposWhatsappQuerySchema.safeParse({ canalId: CANAL, sort: 'id:asc' }).success,
    ).toBe(false);
  });
});

describe('grupoWhatsappPageSchema', () => {
  it('aceita a página de grupos', () => {
    const r = grupoWhatsappPageSchema.safeParse({
      data: [{ id: '1203@g.us', nome: 'Equipe', participantes: 3 }],
      meta: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    });
    expect(r.success).toBe(true);
  });
});
