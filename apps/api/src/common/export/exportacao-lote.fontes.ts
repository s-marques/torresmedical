import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { ExportacaoLoteEntidade } from '@torres/shared';
import type { ExportFile } from './export.types';

/** Uma tabela do lote: vira `<nome>.csv` dentro do ZIP. */
export interface TabelaDoLote {
  nome: string;
  arquivo: ExportFile;
}

/** Arquivo do storage que entra no ZIP em `<caminho>`. */
export interface ArquivoDoLote {
  caminho: string;
  arquivoId: string;
}

/**
 * Fonte de dados de uma entidade na exportação em lote (issue #158). Cada módulo dono da
 * entidade implementa a sua e a registra: o módulo de configurações só conhece este contrato
 * (CLAUDE.md, seção 3: um módulo não acessa as tabelas de outro).
 * Roda fora de uma requisição (consumidor de fila), então o escopo de dados é `TODOS`.
 */
export interface FonteExportacaoLote {
  readonly entidade: ExportacaoLoteEntidade;
  /** CSVs da entidade, com os mesmos dados e colunas da exportação dos grids. */
  tabelas(): Promise<TabelaDoLote[]>;
  /** Arquivos ligados aos registros (anexos, PDFs). Omitir quando não há. */
  arquivos?(): Promise<ArquivoDoLote[]>;
}

@Injectable()
export class ExportacaoLoteFontes {
  private readonly fontes = new Map<ExportacaoLoteEntidade, FonteExportacaoLote>();

  registrar(fonte: FonteExportacaoLote): void {
    this.fontes.set(fonte.entidade, fonte);
  }

  obter(entidade: ExportacaoLoteEntidade): FonteExportacaoLote | undefined {
    return this.fontes.get(entidade);
  }

  disponiveis(): ExportacaoLoteEntidade[] {
    return [...this.fontes.keys()];
  }
}

/** Base das fontes: registra-se no módulo ao subir a aplicação. */
export abstract class FonteExportacaoLoteBase implements FonteExportacaoLote, OnModuleInit {
  abstract readonly entidade: ExportacaoLoteEntidade;

  constructor(private readonly registro: ExportacaoLoteFontes) {}

  onModuleInit(): void {
    this.registro.registrar(this);
  }

  abstract tabelas(): Promise<TabelaDoLote[]>;
}
