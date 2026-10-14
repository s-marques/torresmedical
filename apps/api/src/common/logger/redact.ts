/**
 * Campos pessoais que nunca podem aparecer em log (LGPD, CLAUDE.md seção 6).
 * A comparação do pino é por nome exato de chave, então as variações comuns estão listadas.
 */
export const SENSITIVE_KEYS = [
  'nome',
  'name',
  'nomeCompleto',
  'nomeSocial',
  'cpf',
  'rg',
  'cnpj',
  'telefone',
  'celular',
  'phone',
  'whatsapp',
  'email',
  'endereco',
  'address',
  'cep',
  'dataNascimento',
  'birthDate',
  'prontuario',
  'evolucao',
  'receita',
  'diagnostico',
  'observacoes',
  'mensagem',
  // Nome original de arquivo enviado (pode trazer o nome do paciente).
  'nomeOriginal',
  'originalname',
  'password',
  'passwordHash',
  'senha',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
] as const;

/** Profundidade coberta: raiz, 1 e 2 níveis (ex.: req.body.cpf, payload.paciente.cpf). */
export const REDACT_PATHS: string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  ...SENSITIVE_KEYS.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]),
];

export const REDACT_CENSOR = '[REDACTED]';
