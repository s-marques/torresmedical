import { describe, expect, it } from 'vitest';
import {
  CANAL_WHATSAPP_NUMERO_INVALIDO,
  createCanalWhatsappSchema,
  definirUsuariosCanalWhatsappSchema,
  updateCanalWhatsappSchema,
} from './canal-whatsapp';

const USUARIO = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

describe('canal WhatsApp', () => {
  it('cria: normaliza o número, tira espaços do nome e usa defaults', () => {
    expect(
      createCanalWhatsappSchema.parse({ nome: '  Recepção ', numero: '(65) 99999-0000' }),
    ).toEqual({
      nome: 'Recepção',
      numero: '5565999990000',
      profissionalId: null,
      usuarioIds: [],
    });
  });

  it('cria: mensagens dos obrigatórios vazios', () => {
    const resultado = createCanalWhatsappSchema.safeParse({ nome: '', numero: '' });
    expect(resultado.error?.issues.map((i) => i.message)).toEqual([
      'Nome do Canal é obrigatório.',
      'Número WhatsApp é obrigatório.',
    ]);
  });

  it('número com poucos dígitos é inválido', () => {
    const resultado = createCanalWhatsappSchema.safeParse({ nome: 'X', numero: '123' });
    expect(resultado.error?.issues[0]?.message).toBe(CANAL_WHATSAPP_NUMERO_INVALIDO);
  });

  it('remove usuários repetidos e converte profissional vazio em null', () => {
    const dados = createCanalWhatsappSchema.parse({
      nome: 'X',
      numero: '65999990000',
      profissionalId: '',
      usuarioIds: [USUARIO, USUARIO],
    });
    expect(dados.usuarioIds).toEqual([USUARIO]);
    expect(dados.profissionalId).toBeNull();
  });

  it('edita: Telefone obrigatório e campos extras recusados', () => {
    const resultado = updateCanalWhatsappSchema.safeParse({ nome: 'X', numero: '', tipo: 'A' });
    expect(resultado.error?.issues.map((i) => i.message)).toEqual([
      'Telefone é obrigatório.',
      expect.any(String),
    ]);
  });

  it('usuários: lista vazia é válida (todos têm acesso)', () => {
    expect(definirUsuariosCanalWhatsappSchema.parse({ usuarioIds: [] })).toEqual({
      usuarioIds: [],
    });
    expect(definirUsuariosCanalWhatsappSchema.safeParse({ usuarioIds: ['x'] }).success).toBe(false);
  });
});
