import type { ExportFormat } from '@torres/shared';

/**
 * Ponto de extensão para relatórios pesados (CLAUDE.md, seção 5: "relatórios grandes" vão para
 * fila). Só a interface: ainda não há implementação nem provider registrado. A implementação
 * publica o pedido com o `EventPublisher` (`common/messaging`) e um consumidor gera o arquivo;
 * aí o `RelatoriosService` passa a enfileirar os relatórios com `execucao: 'fila'`.
 */
export const FILA_RELATORIOS = Symbol('FILA_RELATORIOS');

/** Pedido enviado à fila: só ids e filtros, nunca dados pessoais (CLAUDE.md, seção 5). */
export interface PedidoRelatorio {
  modulo: string;
  relatorioId: string;
  /** Query validada do relatório (período, ordenação e filtros). */
  filtros: Readonly<Record<string, unknown>>;
  formato: ExportFormat;
  usuarioId: string;
}

export interface FilaRelatorios {
  /** Publica o pedido e devolve o id para o usuário acompanhar. */
  enfileirar(pedido: PedidoRelatorio): Promise<{ pedidoId: string }>;
}
