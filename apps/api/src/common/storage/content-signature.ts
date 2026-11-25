import type { ArquivoFormato } from '@torres/shared';

type Assinatura = (conteudo: Buffer) => boolean;

const comeca =
  (bytes: readonly number[], offset = 0): Assinatura =>
  (conteudo) =>
    conteudo.length >= offset + bytes.length && bytes.every((b, i) => conteudo[offset + i] === b);

const ascii = (texto: string, offset = 0): Assinatura =>
  comeca([...Buffer.from(texto, 'latin1')], offset);

const algum =
  (...assinaturas: Assinatura[]): Assinatura =>
  (conteudo) =>
    assinaturas.some((a) => a(conteudo));

/** Texto: sem byte nulo no início do arquivo (descarta binários renomeados). */
const TEXTO_AMOSTRA = 8192;
const texto: Assinatura = (conteudo) => !conteudo.subarray(0, TEXTO_AMOSTRA).includes(0);

/** Frame de áudio MPEG sem tag ID3 (11 bits de sincronismo). */
const frameMpeg: Assinatura = (conteudo) =>
  conteudo.length >= 2 && conteudo[0] === 0xff && ((conteudo[1] ?? 0) & 0xe0) === 0xe0;

const jpeg = comeca([0xff, 0xd8, 0xff]);

/** Assinatura (magic bytes) esperada de cada formato aceito. */
const ASSINATURAS: Readonly<Record<ArquivoFormato, Assinatura>> = {
  jpg: jpeg,
  jpeg,
  png: comeca([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  gif: algum(ascii('GIF87a'), ascii('GIF89a')),
  webp: (conteudo) => ascii('RIFF')(conteudo) && ascii('WEBP', 8)(conteudo),
  svg: texto,
  pdf: ascii('%PDF-'),
  docx: comeca([0x50, 0x4b, 0x03, 0x04]),
  mp3: algum(ascii('ID3'), frameMpeg),
  ogg: ascii('OggS'),
  mp4: ascii('ftyp', 4),
  zip: comeca([0x50, 0x4b]),
  ofx: texto,
  csv: texto,
  xml: texto,
  txt: texto,
  md: texto,
};

/** O conteúdo corresponde ao formato da extensão? Impede, por exemplo, um executável renomeado para `.png`. */
export function conteudoConfere(conteudo: Buffer, formato: ArquivoFormato): boolean {
  return ASSINATURAS[formato](conteudo);
}
