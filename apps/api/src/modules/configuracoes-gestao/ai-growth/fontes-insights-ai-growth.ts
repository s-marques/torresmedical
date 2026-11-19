import { Injectable } from '@nestjs/common';
import type { AiGrowthParametros, AiGrowthTipo } from '@torres/shared';

/** Resultado de uma regra: só o tipo e os números, nunca dado pessoal. */
export interface InsightCalculado {
  tipo: AiGrowthTipo;
  quantidade: number;
  parametros?: AiGrowthParametros;
}

/**
 * Quem tem os dados de um módulo calcula os insights dele. O `configuracoes-gestao` não lê tabela
 * de outro módulo (CLAUDE.md, seção 3) e o módulo comercial já depende deste: por isso a fonte
 * se registra aqui em `onModuleInit`, em vez de ser importada.
 */
export interface FonteInsightsAiGrowth {
  coletar(agora: Date): Promise<InsightCalculado[]>;
}

@Injectable()
export class FontesInsightsAiGrowth {
  private readonly fontes: FonteInsightsAiGrowth[] = [];

  registrar(fonte: FonteInsightsAiGrowth): void {
    if (!this.fontes.includes(fonte)) this.fontes.push(fonte);
  }

  async coletar(agora: Date): Promise<InsightCalculado[]> {
    const grupos = await Promise.all(this.fontes.map((fonte) => fonte.coletar(agora)));
    return grupos.flat();
  }
}
