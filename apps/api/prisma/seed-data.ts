import { fakerPT_BR as faker } from '@faker-js/faker';
import type { PrismaClient } from '../src/generated/prisma/client';

/**
 * Dados de desenvolvimento 100% fictícios (CLAUDE.md, seção 6).
 * Nunca use nomes, documentos ou telefones do inventário: tudo vem do faker.
 */

export const SEED = 73;
export const SEED_EMAIL_DOMAIN = 'example.com';

export interface SeedData {
  empresa: { id: string; nome: string; documento: string; email: string; telefone: string };
  unidades: { id: string; empresaId: string; nome: string }[];
  usuarios: { id: string; empresaId: string; nome: string; email: string; telefone: string }[];
}

/** Gera um CNPJ fictício com dígitos verificadores válidos (somente dígitos). */
export function gerarCnpj(): string {
  const base = faker.string.numeric(8) + '0001';
  const digito = (numeros: string): number => {
    let peso = numeros.length - 7;
    let soma = 0;
    for (const n of numeros) {
      soma += Number(n) * peso--;
      if (peso < 2) peso = 9;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = digito(base);
  const d2 = digito(base + d1);
  return `${base}${d1}${d2}`;
}

/** Celular fictício: DDD + 9 + 8 dígitos. */
function gerarCelular(): string {
  return faker.helpers.fromRegExp(/[1-9]{2}9[0-9]{8}/);
}

/** Determinístico: a mesma semente gera os mesmos dados (e os mesmos ids). */
export function buildSeedData(): SeedData {
  faker.seed(SEED);

  const empresa = {
    id: faker.string.uuid(),
    nome: faker.company.name(),
    documento: gerarCnpj(),
    email: `contato@${SEED_EMAIL_DOMAIN}`,
    telefone: gerarCelular(),
  };

  const unidades = Array.from({ length: 3 }, () => ({
    id: faker.string.uuid(),
    empresaId: empresa.id,
    nome: `Unidade ${faker.location.city()}`,
  }));

  const usuarios = Array.from({ length: 5 }, (_, i) => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const usuario = faker.internet
      .username({ firstName, lastName })
      .toLowerCase()
      .replaceAll(/[^a-z0-9._-]/g, '');
    return {
      id: faker.string.uuid(),
      empresaId: empresa.id,
      nome: `${firstName} ${lastName}`,
      // O índice garante e-mail único mesmo se o faker repetir o nome.
      email: `${usuario}.${i + 1}@${SEED_EMAIL_DOMAIN}`,
      telefone: gerarCelular(),
    };
  });

  return { empresa, unidades, usuarios };
}

/** Idempotente: pode rodar várias vezes (upsert pelos ids determinísticos). */
export async function applySeed(prisma: PrismaClient): Promise<SeedData> {
  const data = buildSeedData();
  const { empresa, unidades, usuarios } = data;

  await prisma.$transaction(async (tx) => {
    await tx.empresa.upsert({ where: { id: empresa.id }, create: empresa, update: empresa });
    for (const unidade of unidades) {
      await tx.unidade.upsert({ where: { id: unidade.id }, create: unidade, update: unidade });
    }
    for (const usuario of usuarios) {
      await tx.usuario.upsert({ where: { id: usuario.id }, create: usuario, update: usuario });
    }
  });

  return data;
}
