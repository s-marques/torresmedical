import { TransactionHost } from '@nestjs-cls/transactional';
import {
  Body,
  Controller,
  Delete,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  type Type,
} from '@nestjs/common';
import { Audit } from '../../src/common/audit/audit.decorator';
import { SomenteAutenticado } from '../../src/common/auth/auth.decorators';
import type { PrismaAdapter } from '../../src/common/prisma/prisma-transaction';

/** Models das entidades compartilhadas criadas na issue #81 (nome do model Prisma = entidade auditada). */
export const ENTIDADES_COMPARTILHADAS = [
  'Paciente',
  'Especialidade',
  'Profissional',
  'Fornecedor',
  'Categoria',
  'UnidadeMedida',
  'Produto',
  'Cargo',
  'Funcionario',
  'FormaPagamento',
  'TipoAgendamento',
] as const;

export type EntidadeCompartilhada = (typeof ENTIDADES_COMPARTILHADAS)[number];

interface Delegate {
  create(args: { data: object }): Promise<object>;
  update(args: { where: { id: string }; data: object }): Promise<object>;
}

/**
 * Escrita auditada de uma entidade, só para o e2e da auditoria: o CRUD das entidades é das
 * telas, mas a auditoria precisa achar o model de cada uma (before) e gravar o after.
 * Segue o padrão das telas: `txHost.tx`, `@Audit` e retorno da entidade resultante.
 */
function fixtureController(entidade: EntidadeCompartilhada): Type<unknown> {
  const modelo = entidade.charAt(0).toLowerCase() + entidade.slice(1);

  @Controller(`test-fixtures/entidades/${entidade}`)
  @SomenteAutenticado()
  class EntidadeFixtureController {
    constructor(private readonly txHost: TransactionHost<PrismaAdapter>) {}

    private get delegate(): Delegate {
      return (this.txHost.tx as unknown as Record<string, Delegate>)[modelo] as Delegate;
    }

    @Post()
    @Audit({ entity: entidade })
    criar(@Body() body: object) {
      return this.delegate.create({ data: body });
    }

    @Patch(':id')
    @Audit({ entity: entidade })
    alterar(@Param('id', ParseUUIDPipe) id: string, @Body() body: object) {
      return this.delegate.update({ where: { id }, data: body });
    }

    @Delete(':id')
    @Audit({ entity: entidade })
    excluir(@Param('id', ParseUUIDPipe) id: string) {
      return this.delegate.update({ where: { id }, data: { deletedAt: new Date() } });
    }
  }

  Object.defineProperty(EntidadeFixtureController, 'name', {
    value: `${entidade}FixtureController`,
  });
  return EntidadeFixtureController;
}

@Module({ controllers: ENTIDADES_COMPARTILHADAS.map(fixtureController) })
export class EntidadesCompartilhadasFixtureModule {}
