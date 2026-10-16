/** Só o tipo do erro, para log e outbox: a mensagem pode trazer dados pessoais. */
export function errorType(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}
