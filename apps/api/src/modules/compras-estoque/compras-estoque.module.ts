import { forwardRef, Module } from '@nestjs/common';
import { criarLookupController } from '../../common/lookups/lookup.controller';
import { FinanceiroModule } from '../financeiro/financeiro.module';
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
import { PedidosCompraController } from './pedidos-compra/pedidos-compra.controller';
import { PedidosCompraService } from './pedidos-compra/pedidos-compra.service';
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
  PedidosCompraService,
];

/**
 * Módulo COMPRAS / ESTOQUE do inventário. Dono das entidades Fornecedor, Produto/Serviço,
 * Categoria e Unidade de medida, da Entrada de Compras, do Estoque (saldo e movimentações), dos
 * Lotes / Validade e dos Pedidos de Compra (Pedidos em Trânsito).
 */
@Module({
  imports: [forwardRef(() => FinanceiroModule)],
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
    PedidosCompraController,
  ],
  providers: SERVICES,
  exports: SERVICES,
})
export class ComprasEstoqueModule {}
