import { Module } from '@nestjs/common';
import { ImoveisController } from './imoveis/imoveis.controller';
import { ImoveisService } from './imoveis/imoveis.service';
import { PatrimonioController } from './patrimonio/patrimonio.controller';
import { PatrimonioService } from './patrimonio/patrimonio.service';
import { VeiculosController } from './veiculos/veiculos.controller';
import { VeiculosService } from './veiculos/veiculos.service';

/** Módulo PATRIMÔNIO & PESSOAL do inventário. Dono de Bem (tela Patrimônio, #62), Imóvel (tela Imóveis, #61) e Veículo (tela Veículos, #63). */
@Module({
  controllers: [PatrimonioController, ImoveisController, VeiculosController],
  providers: [PatrimonioService, ImoveisService, VeiculosService],
})
export class PatrimonioPessoalModule {}
