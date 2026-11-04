import { Module } from '@nestjs/common';
import { criarLookupController } from '../../common/lookups/lookup.controller';
import { CargosController } from './cargos/cargos.controller';
import { CargosService } from './cargos/cargos.service';
import { ComissoesController } from './comissoes/comissoes.controller';
import { ComissoesService } from './comissoes/comissoes.service';
import { FuncionariosController } from './funcionarios/funcionarios.controller';
import { FuncionariosService } from './funcionarios/funcionarios.service';

/** Módulo REGULATÓRIO / QUALIDADE do inventário. Dono das entidades Funcionário e Cargo. */
@Module({
  controllers: [
    criarLookupController('funcionarios', FuncionariosService),
    criarLookupController('cargos', CargosService),
    FuncionariosController,
    CargosController,
    ComissoesController,
  ],
  providers: [FuncionariosService, CargosService, ComissoesService],
  exports: [FuncionariosService, CargosService],
})
export class RegulatorioQualidadeModule {}
