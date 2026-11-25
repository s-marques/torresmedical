import { z } from 'zod';

type Json = Record<string, unknown>;

const TEXTO = 'Texto de exemplo bastante longo para testar a quebra de linha no celular';

/**
 * Gera um valor válido para o schema Zod, com textos longos, para as telas renderizarem linhas
 * reais (e não só o estado vazio). Percorre o JSON Schema do Zod; padrões (`pattern`) não são
 * atendidos, então use fixture manual onde o schema exigir um formato específico.
 */
export function amostra(schema: z.ZodType): unknown {
  return gerar(z.toJSONSchema(schema, { io: 'output', unrepresentable: 'any' }) as Json);
}

function gerar(s: Json): unknown {
  if ('const' in s) return s.const;
  if (Array.isArray(s.enum)) return s.enum[0];
  const alternativas = (s.anyOf ?? s.oneOf) as Json[] | undefined;
  if (alternativas) return gerar(alternativas.find((a) => a.type !== 'null') ?? alternativas[0]!);
  const tipo = Array.isArray(s.type) ? s.type.find((t) => t !== 'null') : s.type;
  switch (tipo) {
    case 'object': {
      const props = (s.properties ?? {}) as Record<string, Json>;
      return Object.fromEntries(Object.entries(props).map(([k, v]) => [k, gerar(v)]));
    }
    case 'array': {
      const item = gerar((s.items ?? {}) as Json);
      return Array.from({ length: Math.max(2, Number(s.minItems ?? 0)) }, () => item);
    }
    case 'integer':
      return Math.max(1, Number(s.minimum ?? 1));
    case 'number':
      return Math.max(1234.5, Number(s.minimum ?? 0));
    case 'boolean':
      return true;
    case 'string':
      return texto(s);
    default:
      return null;
  }
}

function texto(s: Json): string {
  switch (s.format) {
    case 'uuid':
      return '00000000-0000-4000-8000-000000000001';
    case 'date-time':
      return '2026-11-25T14:30:00.000Z';
    case 'date':
      return '2026-11-25';
    case 'email':
      return 'paciente.com.nome.longo@example.com';
    case 'time':
      return '14:30';
    default:
      return TEXTO.slice(0, Number(s.maxLength ?? TEXTO.length));
  }
}
