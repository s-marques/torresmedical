/**
 * Ponto de extensão da regra "só exclui serviço sem vínculo". Hoje nenhum cadastro referencia
 * um `ServicoProfissional`; quando um módulo (agenda, vendas, orçamentos…) passar a referenciá-lo,
 * ele registra um verificador em `SERVICO_EM_USO_VERIFICADORES` e o serviço passa a ficar
 * protegido contra exclusão, sem mudar a tela nem o service.
 */
export interface ServicoEmUsoVerificador {
  /** Devolve, dentre `ids`, os serviços que o módulo do verificador referencia. */
  emUso(ids: readonly string[]): Promise<ReadonlySet<string>>;
}

export const SERVICO_EM_USO_VERIFICADORES = Symbol('SERVICO_EM_USO_VERIFICADORES');
