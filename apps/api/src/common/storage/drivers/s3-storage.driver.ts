import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import type { S3StorageConfig } from '../storage.config';
import type { StorageDriver } from './storage-driver';

/** Driver S3-compatível (MinIO no Docker Compose). O bucket é privado: nada é público. */
export class S3StorageDriver implements StorageDriver {
  private readonly bucket: string;

  constructor(
    config: S3StorageConfig,
    private readonly client: S3Client = createS3Client(config),
  ) {
    this.bucket = config.bucket;
  }

  async ensureReady(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      if (!isNotFound(error)) throw error;
      await this.createBucket();
    }
  }

  async put(chave: string, conteudo: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: chave,
        Body: conteudo,
        ContentType: contentType,
        ContentLength: conteudo.length,
      }),
    );
  }

  async get(chave: string): Promise<Readable | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: chave }),
      );
      return (result.Body as Readable | undefined) ?? null;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async delete(chave: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: chave }));
  }

  close(): void {
    this.client.destroy();
  }

  private async createBucket(): Promise<void> {
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      // Outra instância criou o bucket ao mesmo tempo.
      if ((error as { name?: string }).name !== 'BucketAlreadyOwnedByYou') throw error;
    }
  }
}

export function createS3Client(config: S3StorageConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    // MinIO usa o bucket no caminho, não no subdomínio.
    forcePathStyle: Boolean(config.endpoint),
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
}

function isNotFound(error: unknown): boolean {
  const { name, $metadata } = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return name === 'NotFound' || name === 'NoSuchKey' || $metadata?.httpStatusCode === 404;
}
