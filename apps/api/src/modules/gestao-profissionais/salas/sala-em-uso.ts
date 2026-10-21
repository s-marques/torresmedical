/**
 * Ponto de extensão da regra "sala com contrato não pode ser excluída". Hoje nenhum cadastro
 * referencia uma `Sala`; quando o módulo de Contratos existir, ele registra um verificador em
 * `SALA_EM_USO_VERIFICADORES` e a sala passa a ficar protegida, sem mudar a tela nem o service.
 */
export interface SalaEmUsoVerificador {
  /** Devolve, dentre `ids`, as salas que o módulo do verificador referencia. */
  emUso(ids: readonly string[]): Promise<ReadonlySet<string>>;
}

export const SALA_EM_USO_VERIFICADORES = Symbol('SALA_EM_USO_VERIFICADORES');
