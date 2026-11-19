import { Module } from '@nestjs/common';
import { ImoveisController } from './imoveis/imoveis.controller';
import { ImoveisService } from './imoveis/imoveis.service';

/** Módulo PATRIMÔNIO & PESSOAL do inventário. Dono de Imóvel (tela Imóveis, issue #61). */
@Module({
  controllers: [ImoveisController],
  providers: [ImoveisService],
})
export class PatrimonioPessoalModule {}
