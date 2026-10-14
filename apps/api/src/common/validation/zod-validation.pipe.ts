import { Injectable, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { ValidationException } from '../errors/api.exception';
import { zodIssuesToDetails } from './zod-issues';

/**
 * Valida e converte o valor com um schema Zod de `packages/shared`.
 * Ex.: `@Body(new ZodValidationPipe(createUnidadeSchema)) body: CreateUnidadeInput`.
 * Inválido → 400 `VALIDATION_ERROR` com `details` por campo.
 */
@Injectable()
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) throw new ValidationException(zodIssuesToDetails(result.error.issues));
    return result.data;
  }
}
