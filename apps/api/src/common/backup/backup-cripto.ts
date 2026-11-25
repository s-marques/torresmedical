import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, stat, writeFile } from 'node:fs/promises';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * Cifra arquivos do backup com AES-256-GCM, em fluxo (o dump pode passar de vários GB).
 * Formato: `TMB1` | salt (16) | iv (12) | texto cifrado | tag de autenticação (16).
 * A chave vem de uma frase-senha (scrypt + salt por arquivo). Sem a frase, o arquivo é ilegível.
 */
const MAGIC = Buffer.from('TMB1');
const SALT = 16;
const IV = 12;
const TAG = 16;
const CABECALHO = MAGIC.length + SALT + IV;

function derivarChave(frase: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(frase, salt, 32, (erro, chave) => (erro ? reject(erro) : resolve(chave)));
  });
}

export async function criptografarArquivo(
  origem: string,
  destino: string,
  frase: string,
): Promise<void> {
  const salt = randomBytes(SALT);
  const iv = randomBytes(IV);
  const cipher = createCipheriv('aes-256-gcm', await derivarChave(frase, salt), iv);
  await writeFile(destino, Buffer.concat([MAGIC, salt, iv]));
  const cifrar = new Transform({
    transform(pedaco: Buffer, _codificacao, cb) {
      cb(null, cipher.update(pedaco));
    },
    flush(cb) {
      cb(null, Buffer.concat([cipher.final(), cipher.getAuthTag()]));
    },
  });
  await pipeline(createReadStream(origem), cifrar, createWriteStream(destino, { flags: 'a' }));
}

/** Decifra e confere a autenticação: arquivo adulterado ou chave errada lançam erro. */
export async function descriptografarArquivo(
  origem: string,
  destino: string,
  frase: string,
): Promise<void> {
  const { size } = await stat(origem);
  if (size < CABECALHO + TAG) throw new Error('Arquivo cifrado inválido');
  const arquivo = await open(origem, 'r');
  const cabecalho = Buffer.alloc(CABECALHO);
  const tag = Buffer.alloc(TAG);
  try {
    await arquivo.read(cabecalho, 0, CABECALHO, 0);
    await arquivo.read(tag, 0, TAG, size - TAG);
  } finally {
    await arquivo.close();
  }
  if (!cabecalho.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Formato desconhecido');
  const salt = cabecalho.subarray(MAGIC.length, MAGIC.length + SALT);
  const iv = cabecalho.subarray(MAGIC.length + SALT);
  const decipher = createDecipheriv('aes-256-gcm', await derivarChave(frase, salt), iv);
  decipher.setAuthTag(tag);
  const decifrar = new Transform({
    transform(pedaco: Buffer, _codificacao, cb) {
      cb(null, decipher.update(pedaco));
    },
    flush(cb) {
      try {
        cb(null, decipher.final());
      } catch (erro) {
        cb(erro as Error);
      }
    },
  });
  if (size === CABECALHO + TAG) {
    // Arquivo original vazio: só confere a autenticação (nada a ler entre o cabeçalho e a tag).
    decipher.final();
    await writeFile(destino, Buffer.alloc(0));
    return;
  }
  await pipeline(
    createReadStream(origem, { start: CABECALHO, end: size - TAG - 1 }),
    decifrar,
    createWriteStream(destino),
  );
}

export async function sha256Arquivo(caminho: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(caminho), hash);
  return hash.digest('hex');
}
