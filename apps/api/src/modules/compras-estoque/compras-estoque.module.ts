import { Module } from '@nestjs/common';
import { criarLookupController } from '../../common/lookups/lookup.controller';
import { CategoriasService } from './categorias/categorias.service';
import { FornecedoresService } from './fornecedores/fornecedores.service';
import { ProdutosService } from './produtos/produtos.service';
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
    criarLookupController('categorias', CategoriasService),
    criarLookupController('unidades-medida', UnidadesMedidaService),
  ],
  providers: SERVICES,
  exports: SERVICES,
})
export class ComprasEstoqueModule {}
