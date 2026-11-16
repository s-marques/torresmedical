import { fakerPT_BR as faker } from '@faker-js/faker';
import { PERMISSOES } from '@torres/shared';
import { hashSenha } from '../src/common/auth/senhas';
import type { PrismaClient } from '../src/generated/prisma/client';
import { applySeedEntidades, buildSeedEntidades, type SeedEntidades } from './seed-entidades';
import { applySeedCrm, buildSeedCrm, type SeedCrm } from './seed-crm';
import { applySeedWhatsapp, buildSeedWhatsapp, type SeedWhatsapp } from './seed-whatsapp';

/**
 * Dados de desenvolvimento 100% fictícios (CLAUDE.md, seção 6).
 * Nunca use nomes, documentos ou telefones do inventário: tudo vem do faker.
 */

export const SEED = 73;
export const SEED_EMAIL_DOMAIN = 'example.com';
export const SEED_ADMIN_EMAIL = `admin@${SEED_EMAIL_DOMAIN}`;

export interface SeedData {
  empresa: { id: string; nome: string; documento: string; email: string; telefone: string };
  unidades: { id: string; empresaId: string; nome: string }[];
  usuarios: { id: string; empresaId: string; nome: string; email: string; telefone: string }[];
  /** Perfil com todas as permissões do catálogo. */
  perfilAdmin: { id: string; nome: string; descricao: string };
  /** Usuário que entra no sistema: `admin@example.com`, senha de `SEED_ADMIN_PASSWORD`. */
  admin: {
    id: string;
    empresaId: string;
    perfilId: string;
    nome: string;
    email: string;
    telefone: string;
  };
  /** Entidades compartilhadas (pacientes, profissionais, produtos…). */
  entidades: SeedEntidades;
  /** Atendimento WhatsApp: canais, contatos, conversas, mensagens e tags. */
  whatsapp: SeedWhatsapp;
  /** CRM: pipelines padrão, motivos de perda, negócios e próximas ações. */
  crm: SeedCrm;
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

/**
 * Determinístico: a mesma semente gera os mesmos dados (e os mesmos ids). `agora` é a
 * referência das datas relativas (ex.: conversas de hoje e de ontem no WhatsApp).
 */
export function buildSeedData(agora: Date = new Date()): SeedData {
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

  // Depois dos demais, para não mudar os ids já gerados pela semente.
  const perfilAdmin = {
    id: faker.string.uuid(),
    nome: 'Administrador',
    descricao: 'Acesso total ao sistema',
  };
  const admin = {
    id: faker.string.uuid(),
    empresaId: empresa.id,
    perfilId: perfilAdmin.id,
    nome: faker.person.fullName(),
    email: SEED_ADMIN_EMAIL,
    telefone: gerarCelular(),
  };

  // Também depois dos demais, pelo mesmo motivo.
  const entidades = buildSeedEntidades(SEED_EMAIL_DOMAIN);
  const whatsapp = buildSeedWhatsapp(entidades.pacientes, agora);
  const crm = buildSeedCrm(
    {
      pacientes: entidades.pacientes,
      profissionais: entidades.profissionais,
      origens: entidades.origensCliente,
      responsaveis: [admin, ...usuarios],
    },
    agora,
  );

  return { empresa, unidades, usuarios, perfilAdmin, admin, entidades, whatsapp, crm };
}

/**
 * Idempotente: pode rodar várias vezes (upsert pelos ids determinísticos). O perfil
 * Administrador recebe de novo todo o catálogo de permissões, inclusive as novas.
 */
export async function applySeed(prisma: PrismaClient, senhaAdmin: string): Promise<SeedData> {
  const data = buildSeedData();
  const { empresa, unidades, usuarios, perfilAdmin, admin, entidades, whatsapp, crm } = data;
  const senhaHash = await hashSenha(senhaAdmin);

  await prisma.$transaction(
    async (tx) => {
      await tx.empresa.upsert({ where: { id: empresa.id }, create: empresa, update: empresa });
      for (const unidade of unidades) {
        await tx.unidade.upsert({ where: { id: unidade.id }, create: unidade, update: unidade });
      }
      for (const usuario of usuarios) {
        await tx.usuario.upsert({ where: { id: usuario.id }, create: usuario, update: usuario });
      }
      await tx.perfil.upsert({
        where: { id: perfilAdmin.id },
        create: perfilAdmin,
        update: perfilAdmin,
      });
      await tx.perfilPermissao.deleteMany({ where: { perfilId: perfilAdmin.id } });
      await tx.perfilPermissao.createMany({
        data: PERMISSOES.map((permissao) => ({ perfilId: perfilAdmin.id, permissao })),
      });
      const usuarioAdmin = { ...admin, senhaHash, ativo: true };
      await tx.usuario.upsert({
        where: { id: admin.id },
        create: usuarioAdmin,
        update: usuarioAdmin,
      });
      await applySeedEntidades(tx, entidades);
      await applySeedWhatsapp(tx, whatsapp);
      await applySeedCrm(tx, crm);
    },
    { timeout: 60_000 },
  );

  return data;
}
