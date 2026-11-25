import archiver from 'archiver';
import type { Readable } from 'node:stream';

export interface EntradaZip {
  /** Caminho dentro do ZIP (`pasta/arquivo.ext`). */
  nome: string;
  conteudo: Buffer | Readable;
}

/** Nome seguro para uma entrada de ZIP: sem pastas acima, sem separadores e sem controle. */
export function nomeSeguroZip(nome: string, padrao = 'arquivo'): string {
  const limpo = [...nome]
    .map((caractere) => ((caractere.codePointAt(0) ?? 0) < 32 ? '_' : caractere))
    .join('')
    .replaceAll(/[\\/:*?"<>|]/g, '_')
    .replaceAll(/^\.+/g, '')
    .trim()
    .slice(0, 150);
  return limpo || padrao;
}

/** Compacta as entradas em um ZIP em memória (limite prático: o tamanho do lote). */
export function writeZip(entradas: readonly EntradaZip[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zip = archiver('zip', { zlib: { level: 6 } });
    const partes: Buffer[] = [];
    zip.on('data', (parte: Buffer) => partes.push(parte));
    zip.on('end', () => resolve(Buffer.concat(partes)));
    zip.on('error', reject);
    zip.on('warning', reject);
    for (const entrada of entradas) zip.append(entrada.conteudo, { name: entrada.nome });
    void zip.finalize();
  });
}

/**
 * Como `writeZip`, mas consome as entradas uma a uma e espera cada uma terminar antes de pedir a
 * próxima: só um arquivo do storage fica aberto por vez (lotes com milhares de anexos).
 */
export async function writeZipSequencial(entradas: AsyncIterable<EntradaZip>): Promise<Buffer> {
  const zip = archiver('zip', { zlib: { level: 6 } });
  const partes: Buffer[] = [];
  const pronto = new Promise<Buffer>((resolve, reject) => {
    zip.on('data', (parte: Buffer) => partes.push(parte));
    zip.on('end', () => resolve(Buffer.concat(partes)));
    zip.on('error', reject);
    zip.on('warning', reject);
  });
  // Evita rejeição não tratada se a leitura das entradas falhar antes de aguardarmos `pronto`.
  pronto.catch(() => undefined);

  try {
    for await (const entrada of entradas) {
      const processada = new Promise<void>((resolve) => zip.once('entry', () => resolve()));
      zip.append(entrada.conteudo, { name: entrada.nome });
      await processada;
    }
  } catch (erro) {
    zip.abort();
    throw erro;
  }
  await zip.finalize();
  return pronto;
}
