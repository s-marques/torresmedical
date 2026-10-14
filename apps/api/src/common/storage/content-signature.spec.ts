import type { ArquivoFormato } from '@torres/shared';
import { conteudoConfere } from './content-signature';

const bytes = (...valores: number[]) => Buffer.from(valores);
const texto = (valor: string) => Buffer.from(valor, 'latin1');

const VALIDOS: [ArquivoFormato, Buffer][] = [
  ['jpg', bytes(0xff, 0xd8, 0xff, 0xe0)],
  ['jpeg', bytes(0xff, 0xd8, 0xff, 0xdb)],
  ['png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)],
  ['gif', texto('GIF89a...')],
  ['gif', texto('GIF87a...')],
  ['webp', texto('RIFF\x00\x00\x00\x00WEBPVP8 ')],
  ['pdf', texto('%PDF-1.7')],
  ['docx', bytes(0x50, 0x4b, 0x03, 0x04)],
  ['mp3', texto('ID3\x04')],
  ['mp3', bytes(0xff, 0xfb, 0x90)],
  ['ogg', texto('OggS\x00')],
  ['mp4', texto('\x00\x00\x00\x18ftypmp42')],
  ['ofx', texto('OFXHEADER:100\nDATA:OFXSGML')],
  ['csv', texto('data;valor\n2026-10-14;10,00')],
  ['xml', texto('<?xml version="1.0"?><nfeProc/>')],
  ['txt', texto('texto simples')],
  ['md', texto('# Título')],
];

describe('conteudoConfere', () => {
  it.each(VALIDOS)('aceita %s com a assinatura do formato', (formato, conteudo) => {
    expect(conteudoConfere(conteudo, formato)).toBe(true);
  });

  it('recusa binário renomeado ou conteúdo curto demais', () => {
    const executavel = texto('MZ\x90\x00\x03\x00');

    for (const formato of [
      'jpg',
      'png',
      'gif',
      'webp',
      'pdf',
      'docx',
      'mp3',
      'ogg',
      'mp4',
    ] as const) {
      expect(conteudoConfere(executavel, formato)).toBe(false);
    }
    expect(conteudoConfere(executavel, 'csv')).toBe(false);
    expect(conteudoConfere(bytes(0x89, 0x50), 'png')).toBe(false);
    expect(conteudoConfere(texto('RIFF\x00\x00\x00\x00WAVE'), 'webp')).toBe(false);
  });
});
