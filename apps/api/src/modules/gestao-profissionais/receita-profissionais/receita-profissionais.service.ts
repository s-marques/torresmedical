import { Injectable } from '@nestjs/common';
import type {
  ExportReceitaProfissionaisQuery,
  ListReceitaProfissionaisQuery,
  ReceitaProfissional,
  ResumoReceitaProfissionais,
  ResumoReceitaProfissionaisQuery,
  UpdateReceitaProfissionalInput,
} from '@torres/shared';
import { EscopoDadosService } from '../../../common/auth/escopo-dados.service';
import type { ExportFile } from '../../../common/export/export.types';
import type { Page } from '../../../common/pagination/paginate';
import { ContasReceberService } from '../../financeiro/contas-receber/contas-receber.service';

/**
 * Receita Profissionais (`/receita-profissionais`): receitas recebidas pelos profissionais, com
 * escopo por profissional (issue #153). Os dados são contas a receber do Financeiro, que não
 * entram nos números do Torres.
 */
@Injectable()
export class ReceitaProfissionaisService {
  constructor(
    private readonly contasReceber: ContasReceberService,
    private readonly escopo: EscopoDadosService,
  ) {}

  list(query: ListReceitaProfissionaisQuery): Promise<Page<ReceitaProfissional>> {
    return this.contasReceber.listarReceitas(
      query,
      this.escopo.filtroProfissional(query.profissionalId),
    );
  }

  resumo(query: ResumoReceitaProfissionaisQuery): Promise<ResumoReceitaProfissionais> {
    return this.contasReceber.resumirReceitas(
      query,
      this.escopo.filtroProfissional(query.profissionalId),
    );
  }

  export(query: ExportReceitaProfissionaisQuery): Promise<ExportFile> {
    return this.contasReceber.exportarReceitas(
      query,
      this.escopo.filtroProfissional(query.profissionalId),
    );
  }

  async findById(id: string): Promise<ReceitaProfissional> {
    return this.noEscopo(await this.contasReceber.buscarReceita(id));
  }

  async update(id: string, input: UpdateReceitaProfissionalInput): Promise<ReceitaProfissional> {
    await this.findById(id);
    this.escopo.garantirProfissional(input.profissionalId);
    return this.contasReceber.atualizarReceita(id, input);
  }

  async estornarBaixa(id: string): Promise<ReceitaProfissional> {
    await this.findById(id);
    return this.contasReceber.estornarBaixaReceita(id);
  }

  async remove(id: string): Promise<ReceitaProfissional> {
    await this.findById(id);
    return this.contasReceber.removerReceita(id);
  }

  private noEscopo(receita: ReceitaProfissional): ReceitaProfissional {
    this.escopo.garantirProfissional(receita.profissionalId);
    return receita;
  }
}
