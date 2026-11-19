import { traduzirPtBr, type ErrorDetail } from '@torres/shared';
import { Prisma } from '../../generated/prisma/client';
import { ApiException } from './api.exception';
import { ErrorCode } from './error-codes';

type KnownError = Prisma.PrismaClientKnownRequestError;

/** Converte erros conhecidos do Prisma; retorna undefined para os demais (viram 500). */
export function fromPrismaError(error: unknown): ApiException | undefined {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return undefined;
  switch (error.code) {
    case 'P2002':
      return new ApiException(
        409,
        ErrorCode.DUPLICATE,
        'Registro duplicado',
        duplicateDetails(error),
      );
    case 'P2025':
      return new ApiException(404, ErrorCode.NOT_FOUND, 'Registro não encontrado');
    case 'P2003':
      return new ApiException(
        409,
        ErrorCode.RELATION_CONFLICT,
        'Operação não permitida: o registro está relacionado a outros dados',
      );
    default:
      return undefined;
  }
}

interface UniqueMeta {
  target?: string | string[];
  driverAdapterError?: {
    cause?: { constraint?: { fields?: string[]; index?: string }; table?: string };
  };
}

/**
 * Campo(s) da constraint única violada, em camelCase. Com driver adapter, o Prisma informa só o
 * índice (`<tabela>_<colunas>_key`); o campo sai do nome dele. A validação de unicidade com mensagem
 * própria fica no service (BusinessException); este mapeamento é a rede de segurança.
 */
export function uniqueFields(error: KnownError): string[] {
  const meta = error.meta as UniqueMeta | undefined;
  const cause = meta?.driverAdapterError?.cause;
  const fields =
    cause?.constraint?.fields ??
    toArray(meta?.target) ??
    fromIndexName(cause?.constraint?.index, cause?.table);
  return (fields ?? []).map((field) => toCamelCase(field.replaceAll('"', '')));
}

function toArray(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
}

function fromIndexName(index: string | undefined, table: string | undefined): string[] | undefined {
  if (!index || !table || !index.startsWith(`${table}_`) || !index.endsWith('_key'))
    return undefined;
  return [index.slice(table.length + 1, -'_key'.length)];
}

function toCamelCase(column: string): string {
  return column.replaceAll(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
}

function duplicateDetails(error: KnownError): ErrorDetail[] | undefined {
  const fields = uniqueFields(error);
  if (fields.length === 0) return undefined;
  return fields.map((field) => ({
    field,
    message: traduzirPtBr({ chave: 'validacao.duplicado' }),
    code: 'validacao.duplicado',
  }));
}
