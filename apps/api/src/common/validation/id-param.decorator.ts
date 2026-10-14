import { Param, ParseUUIDPipe } from '@nestjs/common';
import { ValidationException } from '../errors/api.exception';

/** Parâmetro de rota com id uuid. Inválido → 400 `VALIDATION_ERROR` no campo do parâmetro. */
export const IdParam = (name = 'id'): ParameterDecorator =>
  Param(
    name,
    new ParseUUIDPipe({
      exceptionFactory: () =>
        new ValidationException([{ field: name, message: 'Identificador inválido' }]),
    }),
  );
