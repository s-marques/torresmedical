import type { S3Client } from '@aws-sdk/client-s3';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { S3DestinoBackup } from './backup-destino';

const CONFIG = {
  bucket: 'torres-backup',
  region: 'us-east-1',
  accessKeyId: 'a',
  secretAccessKey: 's',
  prefixo: 'prod',
};

function computar(send: jest.Mock): S3DestinoBackup {
  return new S3DestinoBackup(CONFIG, { send } as unknown as S3Client);
}

describe('S3DestinoBackup', () => {
  let pasta: string;
  beforeEach(async () => {
    pasta = await mkdtemp(join(tmpdir(), 'torres-destino-'));
  });
  afterEach(async () => {
    await rm(pasta, { recursive: true, force: true });
  });

  it('prepara: nada a fazer se o bucket existe, cria se não existe, repassa outros erros', async () => {
    const existe = jest.fn().mockResolvedValue({});
    await computar(existe).preparar();
    expect(existe).toHaveBeenCalledTimes(1);

    const naoExiste = jest
      .fn()
      .mockRejectedValueOnce({ name: 'NotFound' })
      .mockResolvedValueOnce({});
    await computar(naoExiste).preparar();
    expect(naoExiste).toHaveBeenCalledTimes(2);

    await expect(
      computar(jest.fn().mockRejectedValue({ name: 'AccessDenied' })).preparar(),
    ).rejects.toEqual({
      name: 'AccessDenied',
    });
  });

  it('envia o arquivo com o prefixo, o tamanho e o tipo', async () => {
    const send = jest.fn().mockResolvedValue({});
    const arquivo = join(pasta, 'a');
    await writeFile(arquivo, 'conteudo');
    await computar(send).enviar('postgres/x.dump.enc', arquivo, 'application/octet-stream');
    const comando = send.mock.calls[0]?.[0] as { input: Record<string, unknown> };
    expect(comando.input).toMatchObject({
      Bucket: 'torres-backup',
      Key: 'prod/postgres/x.dump.enc',
      ContentLength: 8,
      ContentType: 'application/octet-stream',
    });
  });

  it('baixa o objeto para um arquivo', async () => {
    const send = jest.fn().mockResolvedValue({ Body: Readable.from([Buffer.from('baixado')]) });
    const saida = join(pasta, 'saida');
    await computar(send).baixar('postgres/x.dump.enc', saida);
    expect(await readFile(saida, 'utf8')).toBe('baixado');
    expect((send.mock.calls[0]?.[0] as { input: { Key: string } }).input.Key).toBe(
      'prod/postgres/x.dump.enc',
    );
  });

  it('lista todas as páginas e devolve as chaves sem o prefixo', async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce({
        Contents: [{ Key: 'prod/postgres/a', Size: 1 }, { Size: 9 }],
        IsTruncated: true,
        NextContinuationToken: 't2',
      })
      .mockResolvedValueOnce({ Contents: [{ Key: 'prod/postgres/b' }], IsTruncated: false })
      .mockResolvedValueOnce({});
    const destino = computar(send);
    expect(await destino.listar('postgres/')).toEqual([
      { chave: 'postgres/a', tamanho: 1 },
      { chave: 'postgres/b', tamanho: 0 },
    ]);
    expect(
      (send.mock.calls[1]?.[0] as { input: { ContinuationToken: string } }).input.ContinuationToken,
    ).toBe('t2');
    expect(await destino.listar('x/')).toEqual([]);
  });

  it('apaga em lotes de 1000 com o prefixo', async () => {
    const send = jest.fn().mockResolvedValue({});
    const chaves = Array.from({ length: 1001 }, (_, i) => `postgres/${i}`);
    await computar(send).apagar(chaves);
    expect(send).toHaveBeenCalledTimes(2);
    const primeiro = send.mock.calls[0]?.[0] as {
      input: { Delete: { Objects: { Key: string }[] } };
    };
    expect(primeiro.input.Delete.Objects).toHaveLength(1000);
    expect(primeiro.input.Delete.Objects[0]?.Key).toBe('prod/postgres/0');
  });

  it('sem prefixo, usa as chaves como estão', async () => {
    const send = jest.fn().mockResolvedValue({ Contents: [{ Key: 'a/b', Size: 2 }] });
    const destino = new S3DestinoBackup({ ...CONFIG, prefixo: '' }, {
      send,
    } as unknown as S3Client);
    expect(await destino.listar('a/')).toEqual([{ chave: 'a/b', tamanho: 2 }]);
  });
});
