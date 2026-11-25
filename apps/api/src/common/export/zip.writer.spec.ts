import { Readable } from 'node:stream';
import { nomeSeguroZip, writeZip, writeZipSequencial } from './zip.writer';

describe('writeZip', () => {
  it('gera um ZIP com as entradas em Buffer e em stream', async () => {
    const zip = await writeZip([
      { nome: 'a.csv', conteudo: Buffer.from('um') },
      { nome: 'anexos/b.txt', conteudo: Readable.from([Buffer.from('dois')]) },
    ]);

    expect(zip.subarray(0, 2).toString()).toBe('PK');
    const texto = zip.toString('latin1');
    expect(texto).toContain('a.csv');
    expect(texto).toContain('anexos/b.txt');
  });

  it('gera um ZIP válido sem entradas', async () => {
    const zip = await writeZip([]);
    expect(zip.length).toBeGreaterThan(0);
  });
});

describe('nomeSeguroZip', () => {
  it('troca separadores de pasta e caracteres inválidos', () => {
    expect(nomeSeguroZip('a/b\\c.pdf')).toBe('a_b_c.pdf');
    expect(nomeSeguroZip('exame: sangue?.pdf')).toBe('exame_ sangue_.pdf');
  });

  it('remove pontos iniciais (sem subir de pasta)', () => {
    expect(nomeSeguroZip('../segredo.txt')).toBe('_segredo.txt');
  });

  it('usa o padrão para nome vazio', () => {
    expect(nomeSeguroZip('...', 'anexo')).toBe('anexo');
  });
});

describe('writeZipSequencial', () => {
  it('consome as entradas em ordem, uma por vez', async () => {
    const ordem: string[] = [];
    async function* entradas() {
      ordem.push('a');
      yield { nome: 'a.txt', conteudo: Readable.from([Buffer.from('um')]) };
      ordem.push('b');
      yield { nome: 'pasta/b.txt', conteudo: Buffer.from('dois') };
    }

    const zip = await writeZipSequencial(entradas());

    expect(ordem).toEqual(['a', 'b']);
    const texto = zip.toString('latin1');
    expect(texto).toContain('a.txt');
    expect(texto).toContain('pasta/b.txt');
  });

  it('propaga o erro de quem fornece as entradas', async () => {
    // eslint-disable-next-line require-yield
    async function* quebrada(): AsyncGenerator<{ nome: string; conteudo: Buffer }> {
      throw new Error('falhou');
    }
    await expect(writeZipSequencial(quebrada())).rejects.toThrow('falhou');
  });
});
