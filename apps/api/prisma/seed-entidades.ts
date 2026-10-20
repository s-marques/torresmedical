import { fakerPT_BR as faker } from '@faker-js/faker';
import type {
  FinalidadePagamento,
  Prisma,
  TipoFormaPagamento,
  TipoItem,
} from '../src/generated/prisma/client';

/**
 * Entidades compartilhadas do seed (issue #81), 100% fictícias. Os catálogos usam termos
 * genéricos da área; pessoas, empresas, documentos e telefones vêm do faker.
 * Chamado por `buildSeedData` depois dos dados anteriores, para não mudar os ids já gerados.
 */

type ComId<T> = T & { id: string };

export interface SeedEntidades {
  especialidades: ComId<Prisma.EspecialidadeUncheckedCreateInput>[];
  profissionais: ComId<Prisma.ProfissionalUncheckedCreateInput>[];
  pacientes: ComId<Prisma.PacienteUncheckedCreateInput>[];
  fornecedores: ComId<Prisma.FornecedorUncheckedCreateInput>[];
  categorias: ComId<Prisma.CategoriaUncheckedCreateInput>[];
  unidadesMedida: ComId<Prisma.UnidadeMedidaUncheckedCreateInput>[];
  produtos: ComId<Prisma.ProdutoUncheckedCreateInput>[];
  cargos: ComId<Prisma.CargoUncheckedCreateInput>[];
  funcionarios: ComId<Prisma.FuncionarioUncheckedCreateInput>[];
  formasPagamento: ComId<Prisma.FormaPagamentoUncheckedCreateInput>[];
  tiposAgendamento: ComId<Prisma.TipoAgendamentoUncheckedCreateInput>[];
  origensCliente: ComId<Prisma.OrigemClienteUncheckedCreateInput>[];
}

const ESPECIALIDADES = ['Clínica Geral', 'Pediatria', 'Nutrição', 'Dermatologia', 'Cardiologia'];
const CARGOS = ['Recepção', 'Enfermagem', 'Administrativo', 'Higienização'];
const UNIDADES_MEDIDA: [string, string][] = [
  ['UN', 'Unidade'],
  ['CX', 'Caixa'],
  ['FR', 'Frasco'],
  ['AMP', 'Ampola'],
  ['ML', 'Mililitro'],
];
const CATEGORIAS: [string, TipoItem][] = [
  ['Medicamentos', 'PRODUTO'],
  ['Insumos', 'PRODUTO'],
  ['Consultas', 'SERVICO'],
  ['Procedimentos', 'SERVICO'],
];
const FORMAS_PAGAMENTO: [string, FinalidadePagamento, TipoFormaPagamento][] = [
  ['Dinheiro', 'RECEBER', 'DINHEIRO'],
  ['PIX', 'RECEBER', 'PIX'],
  ['Cartão de Crédito', 'RECEBER', 'CARTAO_CREDITO'],
  ['Cartão de Débito', 'RECEBER', 'CARTAO_DEBITO'],
  ['Boleto', 'RECEBER', 'BOLETO'],
  ['Convênio', 'RECEBER', 'CONVENIO'],
  ['Boleto', 'PAGAR', 'PAGAMENTO'],
  ['Transferência', 'PAGAR', 'PAGAMENTO'],
];
const TIPOS_AGENDAMENTO: [string, number][] = [
  ['Consulta', 60],
  ['Retorno', 20],
  ['Avaliação', 30],
  ['Procedimento', 60],
  ['Soroterapia', 60],
];
// Catálogo de captação: termos genéricos, sem dados pessoais.
const ORIGENS_CLIENTE: [string, string][] = [
  ['Indicação', 'indicacao'],
  ['Google', 'google'],
  ['Instagram', 'instagram'],
  ['Facebook', 'facebook'],
  ['Site', 'site'],
];

/** Gera um CPF fictício com dígitos verificadores válidos (somente dígitos). */
export function gerarCpf(): string {
  const base = faker.string.numeric({ length: 9, allowLeadingZeros: true });
  const digito = (numeros: string): number => {
    const soma = [...numeros].reduce((acc, n, i) => acc + Number(n) * (numeros.length + 1 - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = digito(base);
  return `${base}${d1}${digito(base + d1)}`;
}

function celular(): string {
  return faker.helpers.fromRegExp(/[1-9]{2}9[0-9]{8}/);
}

/** A cada `n` registros, um inativo, para o seed exercitar o filtro de status. */
const inativoACada = (n: number) => (i: number) => (i + 1) % n !== 0;

export function buildSeedEntidades(dominioEmail: string): SeedEntidades {
  const email = (prefixo: string, i: number) => `${prefixo}.${i + 1}@${dominioEmail}`;

  const especialidades = ESPECIALIDADES.map((nome) => ({ id: faker.string.uuid(), nome }));
  const profissionais = Array.from({ length: 8 }, (_, i) => ({
    id: faker.string.uuid(),
    nome: faker.person.fullName(),
    registro: `CRM ${faker.string.numeric(5)}/${faker.location.state({ abbreviated: true })}`,
    especialidadeId: faker.helpers.arrayElement(especialidades).id,
    telefone: celular(),
    email: email('profissional', i),
    ativo: inativoACada(4)(i),
  }));
  const pacientes = Array.from({ length: 30 }, (_, i) => ({
    id: faker.string.uuid(),
    nome: faker.person.fullName(),
    documento: gerarCpf(),
    telefone: celular(),
    email: email('paciente', i),
    status: inativoACada(10)(i) ? ('ATIVO' as const) : ('INATIVO' as const),
  }));
  const fornecedores = Array.from({ length: 10 }, (_, i) => ({
    id: faker.string.uuid(),
    nome: faker.company.name(),
    documento: faker.string.numeric(14),
    email: email('fornecedor', i),
    telefone: celular(),
    cidade: faker.location.city(),
    uf: faker.location.state({ abbreviated: true }),
    ativo: inativoACada(5)(i),
  }));
  const categorias = CATEGORIAS.map(([nome, tipo]) => ({
    id: faker.string.uuid(),
    nome,
    tipo,
    cor: faker.color.rgb(),
  }));
  const unidadesMedida = UNIDADES_MEDIDA.map(([sigla, nome]) => ({
    id: faker.string.uuid(),
    sigla,
    nome,
  }));
  const produtos = Array.from({ length: 20 }, (_, i) => {
    const tipo: TipoItem = i < 15 ? 'PRODUTO' : 'SERVICO';
    return {
      id: faker.string.uuid(),
      nome: faker.commerce.productName(),
      tipo,
      sku: tipo === 'PRODUTO' ? faker.string.numeric(13) : null,
      categoriaId: faker.helpers.arrayElement(categorias.filter((c) => c.tipo === tipo)).id,
      unidadeMedidaId: tipo === 'PRODUTO' ? faker.helpers.arrayElement(unidadesMedida).id : null,
      precoVenda: faker.commerce.price({ min: 5, max: 900 }),
      ativo: inativoACada(7)(i),
    };
  });
  const cargos = CARGOS.map((nome) => ({ id: faker.string.uuid(), nome }));
  const funcionarios = Array.from({ length: 8 }, (_, i) => ({
    id: faker.string.uuid(),
    nome: faker.person.fullName(),
    email: email('funcionario', i),
    telefone: celular(),
    cargoId: faker.helpers.arrayElement(cargos).id,
    ativo: inativoACada(4)(i),
  }));
  const formasPagamento = FORMAS_PAGAMENTO.map(([nome, finalidade, tipo]) => ({
    id: faker.string.uuid(),
    nome,
    finalidade,
    tipo,
  }));
  const tiposAgendamento = TIPOS_AGENDAMENTO.map(([nome, duracaoMinutos]) => ({
    id: faker.string.uuid(),
    nome,
    duracaoMinutos,
    cor: faker.color.rgb(),
  }));
  // Por último, para não mudar os ids gerados antes.
  const origensCliente = ORIGENS_CLIENTE.map(([nome, codigo], i) => ({
    id: faker.string.uuid(),
    nome,
    codigo,
    ordem: i + 1,
  }));

  return {
    especialidades,
    profissionais,
    pacientes,
    fornecedores,
    categorias,
    unidadesMedida,
    produtos,
    cargos,
    funcionarios,
    formasPagamento,
    tiposAgendamento,
    origensCliente,
  };
}

type Upsert<T> = (args: { where: { id: string }; create: T; update: T }) => Promise<unknown>;

async function upsertPorId<T extends { id: string }>(registros: T[], upsert: Upsert<T>) {
  for (const registro of registros) {
    await upsert({ where: { id: registro.id }, create: registro, update: registro });
  }
}

/** Idempotente: upsert pelos ids determinísticos, na ordem das FKs. */
export async function applySeedEntidades(
  tx: Prisma.TransactionClient,
  dados: SeedEntidades,
): Promise<void> {
  await upsertPorId(dados.especialidades, (a) => tx.especialidade.upsert(a));
  await upsertPorId(dados.profissionais, (a) => tx.profissional.upsert(a));
  await upsertPorId(dados.pacientes, (a) => tx.paciente.upsert(a));
  await upsertPorId(dados.fornecedores, (a) => tx.fornecedor.upsert(a));
  await upsertPorId(dados.categorias, (a) => tx.categoria.upsert(a));
  await upsertPorId(dados.unidadesMedida, (a) => tx.unidadeMedida.upsert(a));
  await upsertPorId(dados.produtos, (a) => tx.produto.upsert(a));
  await upsertPorId(dados.cargos, (a) => tx.cargo.upsert(a));
  await upsertPorId(dados.funcionarios, (a) => tx.funcionario.upsert(a));
  await upsertPorId(dados.formasPagamento, (a) => tx.formaPagamento.upsert(a));
  await upsertPorId(dados.tiposAgendamento, (a) => tx.tipoAgendamento.upsert(a));
  await upsertPorId(dados.origensCliente, (a) => tx.origemCliente.upsert(a));
}
