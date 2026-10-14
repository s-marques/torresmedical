import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiQuery, ApiResponse, type SchemaObject } from '@nestjs/swagger';
import { apiErrorSchema } from '@torres/shared';
import { z } from 'zod';

type Io = 'input' | 'output';

/** JSON Schema (OpenAPI 3.0) gerado do schema Zod de `packages/shared`: a documentação não duplica o contrato. */
export function zodToOpenApi(schema: z.ZodType, io: Io): SchemaObject {
  const json = z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io,
    unrepresentable: 'any',
  }) as Record<string, unknown>;
  delete json.$schema;
  return json as SchemaObject;
}

/** Corpo da requisição documentado a partir do schema Zod. */
export const ApiZodBody = (schema: z.ZodType): MethodDecorator =>
  ApiBody({ schema: zodToOpenApi(schema, 'input') });

/** Cada campo do schema Zod de query vira um parâmetro de query documentado. */
export function ApiZodQuery(schema: z.ZodType): MethodDecorator {
  const json = zodToOpenApi(schema, 'input');
  const required = new Set(json.required ?? []);
  const properties = (json.properties ?? {}) as Record<string, SchemaObject>;
  return applyDecorators(
    ...Object.entries(properties).map(([name, property]) =>
      ApiQuery({
        name,
        required: required.has(name),
        schema: property,
        description: property.description,
      }),
    ),
  );
}

/** Resposta documentada a partir do schema Zod. */
export const ApiZodResponse = (
  status: number,
  schema: z.ZodType,
  description?: string,
): MethodDecorator => ApiResponse({ status, description, schema: zodToOpenApi(schema, 'output') });

const ERROR_DESCRIPTIONS: Readonly<Record<number, string>> = {
  400: 'Dados inválidos (`details` por campo)',
  401: 'Não autenticado',
  403: 'Sem permissão',
  404: 'Não encontrado',
  409: 'Conflito (ex.: registro duplicado)',
  422: 'Regra de negócio',
};

/** Respostas de erro no formato padrão (`apiErrorSchema`). */
export function ApiErrorResponses(...statuses: number[]): MethodDecorator {
  const schema = zodToOpenApi(apiErrorSchema, 'output');
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({ status, description: ERROR_DESCRIPTIONS[status], schema }),
    ),
  );
}
