/** Usuário de operações sem request HTTP (consumidores de fila, jobs, seed). */
export const SYSTEM_USER_ID = 'system';

/** Usuário de requisições HTTP sem autenticação (não deve ocorrer após o guard global). */
export const ANONYMOUS_USER_ID = 'anonymous';

/** `entity_id` de ações que não se referem a um único registro (ex.: EXPORT de uma listagem). */
export const ALL_ENTITIES_ID = '*';
