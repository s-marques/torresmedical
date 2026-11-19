import { Injectable, type NestMiddleware } from '@nestjs/common';
import {
  ARQUIVO_CAMPO,
  ARQUIVO_OBRIGATORIO_MENSAGEM,
  ARQUIVO_USOS,
  mensagemTamanhoExcedido,
  uploadArquivoQuerySchema,
  type ArquivoUso,
} from '@torres/shared';
import type { NextFunction, Request, Response } from 'express';
import multer, { MulterError } from 'multer';
import { ValidationException } from '../errors/api.exception';
import { validarComCodigos, zodIssuesToDetails } from '../validation/zod-issues';

/**
 * Lê o multipart de `POST /api/arquivos` com o limite de tamanho do uso (`?uso=`): um arquivo
 * acima do limite é recusado durante o envio, sem ficar inteiro na memória.
 * É middleware (e não interceptor) para o corpo ser lido antes de a auditoria abrir a transação.
 * Middleware roda antes do guard: sem `Authorization: Bearer`, o corpo não é lido e o guard
 * responde 401, sem gastar leitura de upload com quem não está logado.
 */
@Injectable()
export class UploadMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    if (!/^bearer\s/i.test(req.headers.authorization ?? '')) {
      next();
      return;
    }
    const query = validarComCodigos(uploadArquivoQuerySchema, req.query);
    if (!query.success) {
      next(new ValidationException(zodIssuesToDetails(query.error.issues)));
      return;
    }
    if (!req.is('multipart/form-data')) {
      next(arquivoInvalido(ARQUIVO_OBRIGATORIO_MENSAGEM));
      return;
    }

    const uso = query.data.uso;
    uploader(uso)(req, res, (error: unknown) =>
      next(error ? toUploadError(error, uso) : undefined),
    );
  }
}

function uploader(uso: ArquivoUso) {
  return multer({
    storage: multer.memoryStorage(),
    // Nomes de arquivo com acento chegam em UTF-8.
    defParamCharset: 'utf8',
    limits: { fileSize: ARQUIVO_USOS[uso].maxBytes, files: 1, fields: 10, parts: 11 },
  }).single(ARQUIVO_CAMPO);
}

export function toUploadError(error: unknown, uso: ArquivoUso): ValidationException {
  if (error instanceof MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') return arquivoInvalido(mensagemTamanhoExcedido(uso));
    if (error.code === 'LIMIT_UNEXPECTED_FILE' || error.code === 'LIMIT_FILE_COUNT') {
      return arquivoInvalido(`Envie um único arquivo no campo "${ARQUIVO_CAMPO}"`);
    }
  }
  return arquivoInvalido('Não foi possível ler o arquivo enviado');
}

function arquivoInvalido(message: string): ValidationException {
  return new ValidationException([{ field: ARQUIVO_CAMPO, message }]);
}
