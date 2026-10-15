import type { INestApplication, Type } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import {
  AUTHENTICATED_METADATA,
  PERMISSION_METADATA,
  PUBLIC_METADATA,
} from '../../src/common/auth/auth.decorators';
import { createE2eApp } from '../utils/create-e2e-app';

/**
 * Toda rota da aplicação declara o acesso (CLAUDE.md, seção 6): `@Public()`,
 * `@RequirePermission(...)` ou `@SomenteAutenticado()`. O guard nega as que não declaram,
 * e este teste aponta qual esqueceu.
 */
describe('Declaração de acesso das rotas (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createE2eApp({ imports: [DiscoveryModule] });
  });

  afterAll(async () => {
    await app.close();
  });

  type Handler = (...args: unknown[]) => unknown;

  function rotas() {
    const reflector = app.get(Reflector);
    const scanner = app.get(MetadataScanner);
    const chaves = [PUBLIC_METADATA, PERMISSION_METADATA, AUTHENTICATED_METADATA];

    return app
      .get(DiscoveryService)
      .getControllers()
      .flatMap(({ metatype, instance }) => {
        const controller = metatype as Type<unknown>;
        const prototipo = Object.getPrototypeOf(instance) as Record<string, unknown>;
        return scanner
          .getAllMethodNames(prototipo)
          .map((nome) => prototipo[nome])
          .filter(
            (handler): handler is Handler =>
              typeof handler === 'function' && Reflect.hasMetadata(METHOD_METADATA, handler),
          )
          .map((handler) => {
            const declarado = chaves.some(
              (chave) =>
                reflector.getAllAndOverride<unknown>(chave, [handler, controller]) !== undefined,
            );
            const base = String(Reflect.getMetadata(PATH_METADATA, controller));
            const caminho = String(Reflect.getMetadata(PATH_METADATA, handler));
            return { rota: `${controller.name}: ${base}/${caminho}`, declarado };
          });
      });
  }

  it('encontra as rotas da aplicação', () => {
    expect(rotas().length).toBeGreaterThan(10);
  });

  it('todas as rotas declaram o acesso', () => {
    const semDeclaracao = rotas()
      .filter((r) => !r.declarado)
      .map((r) => r.rota);

    expect(semDeclaracao).toEqual([]);
  });
});
