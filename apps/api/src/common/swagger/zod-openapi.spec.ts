import { DECORATORS } from '@nestjs/swagger';
import { listUnidadesQuerySchema, unidadeSchema } from '@torres/shared';
import { z } from 'zod';
import { isSwaggerEnabled } from './setup-swagger';
import {
  ApiErrorResponses,
  ApiZodBody,
  ApiZodQuery,
  ApiZodResponse,
  zodToOpenApi,
} from './zod-openapi';

describe('zodToOpenApi', () => {
  it('gera o schema de entrada sem $schema', () => {
    const json = zodToOpenApi(
      z.object({ nome: z.string().min(1), ativo: z.boolean().default(true) }),
      'input',
    );

    expect(json).toMatchObject({
      type: 'object',
      properties: {
        nome: { type: 'string', minLength: 1 },
        ativo: { type: 'boolean', default: true },
      },
      required: ['nome'],
    });
    expect(json).not.toHaveProperty('$schema');
  });

  it('aceita transformações (ex.: sort) sem lançar', () => {
    expect(() => zodToOpenApi(listUnidadesQuerySchema, 'output')).not.toThrow();
  });
});

describe('decorators', () => {
  class Controller {
    @ApiZodQuery(listUnidadesQuerySchema)
    @ApiZodResponse(200, unidadeSchema, 'Unidade')
    @ApiErrorResponses(400, 404)
    list(): void {}

    @ApiZodBody(z.object({ nome: z.string() }))
    create(): void {}
  }

  it('documenta cada campo da query', () => {
    const params = Reflect.getMetadata(DECORATORS.API_PARAMETERS, Controller.prototype.list) as {
      name: string;
      in: string;
    }[];
    expect(params.map((p) => p.name).sort()).toEqual(
      ['empresaId', 'page', 'pageSize', 'search', 'sort', 'status'].sort(),
    );
    expect(params.every((p) => p.in === 'query')).toBe(true);
  });

  it('documenta respostas de sucesso e de erro', () => {
    const responses = Reflect.getMetadata(
      DECORATORS.API_RESPONSE,
      Controller.prototype.list,
    ) as Record<string, { description?: string }>;
    expect(Object.keys(responses).sort()).toEqual(['200', '400', '404']);
    expect(responses['404']?.description).toBe('Não encontrado');
  });

  it('documenta o corpo', () => {
    const params = Reflect.getMetadata(DECORATORS.API_PARAMETERS, Controller.prototype.create) as {
      in: string;
    }[];
    expect(params[0]?.in).toBe('body');
  });
});

describe('isSwaggerEnabled', () => {
  it.each([
    [{ NODE_ENV: 'development' }, true],
    [{ NODE_ENV: 'test' }, true],
    [{ NODE_ENV: 'production' }, false],
    [{ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' }, true],
    [{ NODE_ENV: 'development', SWAGGER_ENABLED: 'false' }, false],
  ])('%o → %s', (env, expected) => {
    expect(isSwaggerEnabled(env as NodeJS.ProcessEnv)).toBe(expected);
  });
});
