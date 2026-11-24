import { Module } from '@nestjs/common';
import { ImoveisController } from './imoveis/imoveis.controller';
import { ImoveisService } from './imoveis/imoveis.service';
import { PatrimonioController } from './patrimonio/patrimonio.controller';
import { PatrimonioService } from './patrimonio/patrimonio.service';

/** Módulo PATRIMÔNIO & PESSOAL do inventário. Dono de Bem (tela Patrimônio, issue #62) e Imóvel (tela Imóveis, issue #61). */
@Module({
  controllers: [PatrimonioController, ImoveisController],
  providers: [PatrimonioService, ImoveisService],
})
export class PatrimonioPessoalModule {}
