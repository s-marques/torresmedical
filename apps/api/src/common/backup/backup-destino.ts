import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { BackupDestinoConfig } from './backup.config';

export const BACKUP_DESTINO = Symbol('BACKUP_DESTINO');

export interface ObjetoDestino {
  chave: string;
  tamanho: number;
}

/** Armazenamento externo dos backups (S3 compatível: outro provedor, outro servidor com MinIO). */
export interface DestinoBackup {
  preparar(): Promise<void>;
  enviar(chave: string, arquivo: string, contentType: string): Promise<void>;
  baixar(chave: string, arquivo: string): Promise<void>;
  listar(prefixo: string): Promise<ObjetoDestino[]>;
  apagar(chaves: readonly string[]): Promise<void>;
}

const LOTE_EXCLUSAO = 1000;

function naoEncontrado(erro: unknown): boolean {
  const e = erro as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === 'NotFound' || e.name === 'NoSuchBucket' || e.$metadata?.httpStatusCode === 404;
}

export class S3DestinoBackup implements DestinoBackup {
  private readonly prefixo: string;

  constructor(
    private readonly config: BackupDestinoConfig,
    private readonly client: S3Client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.endpoint !== undefined,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    }),
  ) {
    this.prefixo = config.prefixo ? `${config.prefixo}/` : '';
  }

  /** Confere o bucket (e o cria se não existir). */
  async preparar(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
    } catch (erro) {
      if (!naoEncontrado(erro)) throw erro;
      await this.client.send(new CreateBucketCommand({ Bucket: this.config.bucket }));
    }
  }

  async enviar(chave: string, arquivo: string, contentType: string): Promise<void> {
    const { size } = await stat(arquivo);
    const corpo = createReadStream(arquivo);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: this.prefixo + chave,
          Body: corpo,
          ContentLength: size,
          ContentType: contentType,
        }),
      );
    } finally {
      corpo.destroy();
    }
  }

  async baixar(chave: string, arquivo: string): Promise<void> {
    const resposta = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: this.prefixo + chave }),
    );
    await pipeline(resposta.Body as Readable, createWriteStream(arquivo));
  }

  async listar(prefixo: string): Promise<ObjetoDestino[]> {
    const objetos: ObjetoDestino[] = [];
    let token: string | undefined;
    do {
      const pagina = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: this.prefixo + prefixo,
          ContinuationToken: token,
        }),
      );
      for (const item of pagina.Contents ?? []) {
        if (item.Key) {
          objetos.push({ chave: item.Key.slice(this.prefixo.length), tamanho: item.Size ?? 0 });
        }
      }
      token = pagina.IsTruncated ? pagina.NextContinuationToken : undefined;
    } while (token);
    return objetos;
  }

  async apagar(chaves: readonly string[]): Promise<void> {
    for (let i = 0; i < chaves.length; i += LOTE_EXCLUSAO) {
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.config.bucket,
          Delete: {
            Objects: chaves.slice(i, i + LOTE_EXCLUSAO).map((c) => ({ Key: this.prefixo + c })),
            Quiet: true,
          },
        }),
      );
    }
  }
}
