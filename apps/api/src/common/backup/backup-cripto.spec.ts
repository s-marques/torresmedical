import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { criptografarArquivo, descriptografarArquivo, sha256Arquivo } from './backup-cripto';

const FRASE = 'frase-de-teste-com-mais-de-trinta-e-dois-caracteres';

describe('backup-cripto', () => {
  let pasta: string;

  beforeEach(async () => {
    pasta = await mkdtemp(join(tmpdir(), 'torres-cripto-'));
  });

  afterEach(async () => {
    await rm(pasta, { recursive: true, force: true });
  });

  async function cifrar(conteudo: Buffer): Promise<{ original: string; cifrado: string }> {
    const original = join(pasta, 'original');
    const cifrado = join(pasta, 'cifrado');
    await writeFile(original, conteudo);
    await criptografarArquivo(original, cifrado, FRASE);
    return { original, cifrado };
  }

  it('cifra e decifra devolvendo exatamente o conteúdo original', async () => {
    const conteudo = Buffer.alloc(300_000, 'dado-ficticio-');
    const { cifrado } = await cifrar(conteudo);
    expect((await readFile(cifrado)).includes(Buffer.from('dado-ficticio-'))).toBe(false);

    const saida = join(pasta, 'saida');
    await descriptografarArquivo(cifrado, saida, FRASE);
    expect((await readFile(saida)).equals(conteudo)).toBe(true);
  });

  it('cifra arquivo vazio e dois arquivos iguais geram saídas diferentes (salt e iv)', async () => {
    const um = await cifrar(Buffer.alloc(0));
    const primeiro = await readFile(um.cifrado);
    const dois = await cifrar(Buffer.alloc(0));
    expect((await readFile(dois.cifrado)).equals(primeiro)).toBe(false);

    const saida = join(pasta, 'saida');
    await descriptografarArquivo(dois.cifrado, saida, FRASE);
    expect((await readFile(saida)).length).toBe(0);
  });

  it('recusa a frase errada', async () => {
    const { cifrado } = await cifrar(Buffer.from('conteudo'));
    await expect(
      descriptografarArquivo(
        cifrado,
        join(pasta, 'saida'),
        'outra-frase-qualquer-com-32-caracteres!',
      ),
    ).rejects.toThrow();
  });

  it('recusa arquivo adulterado', async () => {
    const { cifrado } = await cifrar(Buffer.from('conteudo importante do backup'));
    const bytes = await readFile(cifrado);
    bytes[bytes.length - 20] = (bytes[bytes.length - 20] ?? 0) ^ 0xff;
    await writeFile(cifrado, bytes);
    await expect(descriptografarArquivo(cifrado, join(pasta, 'saida'), FRASE)).rejects.toThrow();
  });

  it('recusa arquivo curto ou de outro formato', async () => {
    const curto = join(pasta, 'curto');
    await writeFile(curto, 'abc');
    await expect(descriptografarArquivo(curto, join(pasta, 's1'), FRASE)).rejects.toThrow(
      'Arquivo cifrado inválido',
    );

    const estranho = join(pasta, 'estranho');
    await writeFile(estranho, Buffer.alloc(100, 1));
    await expect(descriptografarArquivo(estranho, join(pasta, 's2'), FRASE)).rejects.toThrow(
      'Formato desconhecido',
    );
  });

  it('calcula o sha256 em hexadecimal', async () => {
    const arquivo = join(pasta, 'a');
    await writeFile(arquivo, 'abc');
    expect(await sha256Arquivo(arquivo)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
