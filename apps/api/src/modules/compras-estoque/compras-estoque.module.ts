import { Module } from '@nestjs/common';
import { criarLookupController } from '../../common/lookups/lookup.controller';
import { CategoriasController } from './categorias/categorias.controller';
import { CategoriasService } from './categorias/categorias.service';
import { FornecedoresService } from './fornecedores/fornecedores.service';
import { ProdutosController } from './produtos/produtos.controller';
import { ProdutosService } from './produtos/produtos.service';
import { UnidadesMedidaController } from './unidades-medida/unidades-medida.controller';
import { UnidadesMedidaService } from './unidades-medida/unidades-medida.service';

const SERVICES = [FornecedoresService, ProdutosService, CategoriasService, UnidadesMedidaService];

/**
 * Módulo COMPRAS / ESTOQUE do inventário. Dono das entidades Fornecedor, Produto/Serviço,
 * Categoria e Unidade de medida.
 */
@Module({
  controllers: [
    criarLookupController('fornecedores', FornecedoresService),
    criarLookupController('produtos', ProdutosService),
    ProdutosController,
    criarLookupController('categorias', CategoriasService),
    CategoriasController,
    criarLookupController('unidades-medida', UnidadesMedidaService),
    UnidadesMedidaController,
  ],
  providers: SERVICES,
  exports: SERVICES,
})
export class ComprasEstoqueModule {}
