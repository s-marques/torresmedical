import { Module } from '@nestjs/common';
import { ComercialAtendimentoModule } from '../../comercial-atendimento/comercial-atendimento.module';
import { ComprasEstoqueModule } from '../../compras-estoque/compras-estoque.module';
import { FinanceiroModule } from '../../financeiro/financeiro.module';
import { PainelModule } from '../../painel/painel.module';
import { ApresentacaoMensalController } from './apresentacao-mensal.controller';
import { ApresentacaoMensalService } from './apresentacao-mensal.service';

/**
 * Relatório mensal de apresentação da gestão (issue #171). Pertence a Configurações / Gestão (tela
 * Relatórios), mas fica num módulo próprio: ele consome Painel, Financeiro, Estoque e Comercial,
 * e o Painel já importa o módulo de Configurações (importar de volta criaria um ciclo).
 */
@Module({
  imports: [ComercialAtendimentoModule, ComprasEstoqueModule, FinanceiroModule, PainelModule],
  controllers: [ApresentacaoMensalController],
  providers: [ApresentacaoMensalService],
})
export class ApresentacaoMensalModule {}
