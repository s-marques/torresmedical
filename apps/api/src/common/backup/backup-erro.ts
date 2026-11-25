import type { BackupErro } from '@torres/shared';

/** Falha de uma etapa do backup, com código estável. A mensagem nunca carrega dados do banco. */
export class BackupFalha extends Error {
  constructor(
    readonly codigo: BackupErro,
    /** Resumo sem dados pessoais, gravado no registro da execução (ex.: tabelas divergentes). */
    readonly detalhes?: Record<string, unknown>,
  ) {
    super(codigo);
    this.name = 'BackupFalha';
  }
}

export function codigoDoErro(erro: unknown): BackupErro {
  return erro instanceof BackupFalha ? erro.codigo : 'BACKUP_ERRO_INESPERADO';
}
