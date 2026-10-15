import { Module } from '@nestjs/common';
import { criarLookupController } from '../../common/lookups/lookup.controller';
import { CargosService } from './cargos/cargos.service';
import { FuncionariosService } from './funcionarios/funcionarios.service';

/** Módulo REGULATÓRIO / QUALIDADE do inventário. Dono das entidades Funcionário e Cargo. */
@Module({
  controllers: [
    criarLookupController('funcionarios', FuncionariosService),
    criarLookupController('cargos', CargosService),
  ],
  providers: [FuncionariosService, CargosService],
  exports: [FuncionariosService, CargosService],
})
export class RegulatorioQualidadeModule {}
