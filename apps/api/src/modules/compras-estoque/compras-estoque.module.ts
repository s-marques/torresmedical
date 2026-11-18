import { forwardRef, Module } from '@nestjs/common';
import { criarLookupController } from '../../common/lookups/lookup.controller';
import { ComercialAtendimentoModule } from '../comercial-atendimento/comercial-atendimento.module';
import { ConfiguracoesGestaoModule } from '../configuracoes-gestao/configuracoes-gestao.module';
import { FinanceiroModule } from '../financeiro/financeiro.module';
import { GestaoProfissionaisModule } from '../gestao-profissionais/gestao-profissionais.module';
import { BaixasInsumosController } from './baixas-insumos/baixas-insumos.controller';
import { BaixasInsumosService } from './baixas-insumos/baixas-insumos.service';
import { CategoriasController } from './categorias/categorias.controller';
import { CategoriasService } from './categorias/categorias.service';
import { ComprasController } from './compras/compras.controller';
import { ComprasService } from './compras/compras.service';
import { EstoqueController } from './estoque/estoque.controller';
import { EstoqueService } from './estoque/estoque.service';
import { FornecedoresController } from './fornecedores/fornecedores.controller';
import { FornecedoresService } from './fornecedores/fornecedores.service';
import { LotesController } from './lotes/lotes.controller';
import { LotesService } from './lotes/lotes.service';
import { ProdutosController } from './produtos/produtos.controller';
import { ProdutosService } from './produtos/produtos.service';
import { UnidadesMedidaController } from './unidades-medida/unidades-medida.controller';
import { UnidadesMedidaService } from './unidades-medida/unidades-medida.service';

const SERVICES = [
  FornecedoresService,
  ProdutosService,
  CategoriasService,
  UnidadesMedidaService,
  ComprasService,
  LotesService,
  EstoqueService,
  BaixasInsumosService,
];

/**
 * Módulo COMPRAS / ESTOQUE do inventário. Dono das entidades Fornecedor, Produto/Serviço,
 * Categoria e Unidade de medida, da Entrada de Compras, do Estoque (saldo e movimentações) e dos
 * Lotes / Validade.
 */
@Module({
  imports: [
    forwardRef(() => FinanceiroModule),
    forwardRef(() => ComercialAtendimentoModule),
    forwardRef(() => GestaoProfissionaisModule),
    ConfiguracoesGestaoModule,
  ],
  controllers: [
    criarLookupController('fornecedores', FornecedoresService),
    FornecedoresController,
    criarLookupController('produtos', ProdutosService),
    ProdutosController,
    criarLookupController('categorias', CategoriasService),
    CategoriasController,
    criarLookupController('unidades-medida', UnidadesMedidaService),
    UnidadesMedidaController,
    ComprasController,
    EstoqueController,
    LotesController,
    BaixasInsumosController,
  ],
  providers: SERVICES,
  exports: SERVICES,
})
export class ComprasEstoqueModule {}
