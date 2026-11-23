import { forwardRef, Module } from '@nestjs/common';
import { criarLookupController } from '../../common/lookups/lookup.controller';
import { ConfiguracoesGestaoModule } from '../configuracoes-gestao/configuracoes-gestao.module';
import { AlvarasLicencasController } from './alvaras-licencas/alvaras-licencas.controller';
import { AlvarasLicencasService } from './alvaras-licencas/alvaras-licencas.service';
import { CargosController } from './cargos/cargos.controller';
import { CargosService } from './cargos/cargos.service';
import { ColetasResiduoController } from './coletas-residuo/coletas-residuo.controller';
import { ColetasResiduoService } from './coletas-residuo/coletas-residuo.service';
import { ComissoesController } from './comissoes/comissoes.controller';
import { ComissoesService } from './comissoes/comissoes.service';
import { FuncionariosController } from './funcionarios/funcionarios.controller';
import { FuncionariosService } from './funcionarios/funcionarios.service';
import { NaoConformidadesController } from './nao-conformidades/nao-conformidades.controller';
import { NaoConformidadesService } from './nao-conformidades/nao-conformidades.service';
import { TreinamentosController } from './treinamentos/treinamentos.controller';
import { TreinamentosService } from './treinamentos/treinamentos.service';

/** Módulo REGULATÓRIO / QUALIDADE do inventário. Dono das entidades Funcionário e Cargo. */
@Module({
  imports: [forwardRef(() => ConfiguracoesGestaoModule)],
  controllers: [
    criarLookupController('funcionarios', FuncionariosService),
    criarLookupController('cargos', CargosService),
    FuncionariosController,
    CargosController,
    ComissoesController,
    AlvarasLicencasController,
    NaoConformidadesController,
    TreinamentosController,
    ColetasResiduoController,
  ],
  providers: [
    FuncionariosService,
    CargosService,
    ComissoesService,
    AlvarasLicencasService,
    NaoConformidadesService,
    TreinamentosService,
    ColetasResiduoService,
  ],
  exports: [FuncionariosService, CargosService],
})
export class RegulatorioQualidadeModule {}
