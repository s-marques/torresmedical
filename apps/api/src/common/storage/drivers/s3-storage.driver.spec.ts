import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { createS3Client, S3StorageDriver } from './s3-storage.driver';

const CONFIG = {
  endpoint: 'http://minio:9000',
  region: 'us-east-1',
  bucket: 'torres-arquivos',
  accessKeyId: 'chave',
  secretAccessKey: 'segredo',
};

function erro(name: string, httpStatusCode?: number) {
  return Object.assign(new Error(name), { name, $metadata: { httpStatusCode } });
}

function setup() {
  const send = jest.fn();
  const destroy = jest.fn();
  const driver = new S3StorageDriver(CONFIG, { send, destroy } as unknown as S3Client);
  const comando = (i: number) => send.mock.calls[i]?.[0] as { input: Record<string, unknown> };
  return { driver, send, destroy, comando };
}

describe('S3StorageDriver', () => {
  it('ensureReady não cria o bucket se ele existir', async () => {
    const { driver, send, comando } = setup();
    send.mockResolvedValue({});

    await driver.ensureReady();

    expect(send).toHaveBeenCalledTimes(1);
    expect(comando(0)).toBeInstanceOf(HeadBucketCommand);
    expect(comando(0).input).toEqual({ Bucket: 'torres-arquivos' });
  });

  it('ensureReady cria o bucket inexistente e tolera criação concorrente', async () => {
    const { driver, send, comando } = setup();
    send.mockRejectedValueOnce(erro('NotFound', 404)).mockResolvedValueOnce({});

    await driver.ensureReady();
    expect(comando(1)).toBeInstanceOf(CreateBucketCommand);

    send
      .mockRejectedValueOnce(erro('NotFound', 404))
      .mockRejectedValueOnce(erro('BucketAlreadyOwnedByYou', 409));
    await expect(driver.ensureReady()).resolves.toBeUndefined();
  });

  it('ensureReady propaga outros erros', async () => {
    const { driver, send } = setup();
    send.mockRejectedValueOnce(erro('AccessDenied', 403));
    await expect(driver.ensureReady()).rejects.toThrow('AccessDenied');

    send
      .mockRejectedValueOnce(erro('NotFound', 404))
      .mockRejectedValueOnce(erro('AccessDenied', 403));
    await expect(driver.ensureReady()).rejects.toThrow('AccessDenied');
  });

  it('put envia conteúdo, tipo e tamanho', async () => {
    const { driver, send, comando } = setup();
    send.mockResolvedValue({});
    const conteudo = Buffer.from('abc');

    await driver.put('avatar/x', conteudo, 'image/png');

    expect(comando(0)).toBeInstanceOf(PutObjectCommand);
    expect(comando(0).input).toEqual({
      Bucket: 'torres-arquivos',
      Key: 'avatar/x',
      Body: conteudo,
      ContentType: 'image/png',
      ContentLength: 3,
    });
  });

  it('get devolve o stream, null para chave inexistente e propaga outros erros', async () => {
    const { driver, send, comando } = setup();
    const body = Readable.from(['abc']);
    send.mockResolvedValueOnce({ Body: body });

    await expect(driver.get('avatar/x')).resolves.toBe(body);
    expect(comando(0)).toBeInstanceOf(GetObjectCommand);
    expect(comando(0).input).toEqual({ Bucket: 'torres-arquivos', Key: 'avatar/x' });

    send.mockResolvedValueOnce({});
    await expect(driver.get('vazio')).resolves.toBeNull();

    send.mockRejectedValueOnce(erro('NoSuchKey', 404));
    await expect(driver.get('nao/existe')).resolves.toBeNull();

    send.mockRejectedValueOnce(erro('InternalError', 500));
    await expect(driver.get('x')).rejects.toThrow('InternalError');
  });

  it('delete remove o objeto', async () => {
    const { driver, send, comando } = setup();
    send.mockResolvedValue({});

    await driver.delete('avatar/x');

    expect(comando(0)).toBeInstanceOf(DeleteObjectCommand);
    expect(comando(0).input).toEqual({ Bucket: 'torres-arquivos', Key: 'avatar/x' });
  });

  it('close encerra as conexões do client', () => {
    const { driver, destroy } = setup();

    driver.close();

    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

describe('createS3Client', () => {
  it('usa path-style com endpoint próprio (MinIO)', async () => {
    const client = createS3Client(CONFIG);

    expect(client.config.forcePathStyle).toBe(true);
    expect(await client.config.region()).toBe('us-east-1');
    expect(createS3Client({ ...CONFIG, endpoint: undefined }).config.forcePathStyle).toBe(false);
  });
});
