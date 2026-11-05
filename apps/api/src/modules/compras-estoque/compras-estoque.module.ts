import { forwardRef, Module } from '@nestjs/common';
import { criarLookupController } from '../../common/lookups/lookup.controller';
import { FinanceiroModule } from '../financeiro/financeiro.module';
import { CategoriasController } from './categorias/categorias.controller';
import { CategoriasService } from './categorias/categorias.service';
import { ComprasController } from './compras/compras.controller';
import { ComprasService } from './compras/compras.service';
import { FornecedoresController } from './fornecedores/fornecedores.controller';
import { FornecedoresService } from './fornecedores/fornecedores.service';
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
];

/**
 * Módulo COMPRAS / ESTOQUE do inventário. Dono das entidades Fornecedor, Produto/Serviço,
 * Categoria e Unidade de medida, e da Entrada de Compras.
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
  ],
  providers: SERVICES,
  exports: SERVICES,
})
export class ComprasEstoqueModule {}
