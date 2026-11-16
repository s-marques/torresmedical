import { fakerPT_BR as faker } from '@faker-js/faker';
import { gerarCodigoOrigemCliente } from '@torres/shared';
import type { MarcoEstagio, Prisma } from '../src/generated/prisma/client';

/**
 * CRM do seed (issue #13): os dois pipelines padrão, os motivos de perda e negócios fictícios
 * espalhados pelos estágios. Títulos genéricos, sem dados do inventário.
 */

type ComId<T> = T & { id: string };

export interface SeedCrm {
  pipelines: ComId<Prisma.PipelineUncheckedCreateInput>[];
  estagios: ComId<Prisma.EstagioPipelineUncheckedCreateInput>[];
  motivosPerda: ComId<Prisma.MotivoPerdaUncheckedCreateInput>[];
  negocios: ComId<Prisma.NegocioUncheckedCreateInput>[];
  atividades: ComId<Prisma.AtividadeNegocioUncheckedCreateInput>[];
}

type DefEstagio = [nome: string, cor: string, marco: MarcoEstagio | null];

/** Pipeline padrão do Torres (requisitos do cliente, seções 21 e 23). */
export const ESTAGIOS_TORRES: readonly DefEstagio[] = [
  ['Prospecção', '#64748b', null],
  ['Contato inicial', '#3b82f6', 'PRIMEIRO_CONTATO'],
  ['Qualificação', '#1d4ed8', null],
  ['Score', '#8b5cf6', null],
  ['Visita', '#22d3ee', 'VISITA'],
  ['Proposta', '#84cc16', 'PROPOSTA'],
  ['Negociação', '#a855f7', null],
  ['Aprovação', '#f59e0b', null],
  ['Contrato', '#22c55e', 'CONTRATO'],
];

/** Estágios do sistema atual (inventário, modal "Configurações do CRM"). */
export const ESTAGIOS_LOCACOES: readonly DefEstagio[] = [
  ['CONTATO INICIADO', '#3b82f6', null],
  ['QUALIFICAÇÃO', '#1d00d6', null],
  ['VISITA A AGENDAR', '#22d3ee', null],
  ['VISITA AGENDADA', '#7c6fcd', null],
  ['PROPOSTA APRESENTADA', '#a3e635', 'PROPOSTA'],
  ['EM DECISÃO / NEGOCIAÇÃO', '#a855f7', null],
  ['VENDA GANHA / CONTRATO ASSINADO', '#22c55e', 'CONTRATO'],
  ['VENDA PERDIDA', '#ef4444', null],
  ['VISITA REALIZADA', '#4ade80', 'VISITA'],
  ['DOCUMENTAÇÃO EM ANÁLISE', '#5f6f3a', null],
  ['NUTRIÇÃO FUTURO', '#f97316', null],
  ['NÃO QUALIFICADO / FOLLOW-UP DE QUALIFICAÇÃO', '#f43f5e', null],
  ['FOLLOW-UP', '#f0abfc', null],
  ['DEMANDA SALA DE PROCEDIMENTOS / INJETÁVEIS / SOROTERAPIA', '#06b6d4', null],
];

export const PIPELINES_PADRAO: readonly [string, readonly DefEstagio[]][] = [
  ['Pipeline Torres', ESTAGIOS_TORRES],
  ['VENDAS DE LOCAÇÕES', ESTAGIOS_LOCACOES],
];

/** Motivos de perda do sistema atual (genéricos, sem dados pessoais). */
export const MOTIVOS_PERDA_PADRAO: readonly string[] = [
  'Concorrente',
  'Decisão de sócio/terceiro',
  'Documentação não aprovada',
  'Momento inadequado',
  'Preço',
  'Questão sanitária/técnica',
  'Sem demanda (não possui pacientes suficientes)',
  'Tem consultório próprio',
  'Sem retorno - não responde',
  'Desistência',
  'Atendimento',
  'Localização',
  'Prazo',
  'Outro',
];

const SALAS = ['Sala 07', 'Sala 08', 'Sala 10', 'Sala 11', 'Loja 04'];
const AREAS = ['Clínica geral', 'Cardiologia', 'Nutrição', 'Fisioterapia', 'Estética', 'Ortopedia'];

const MARCO_COLUNA = {
  PRIMEIRO_CONTATO: 'marcoPrimeiroContatoEm',
  VISITA: 'marcoVisitaEm',
  PROPOSTA: 'marcoPropostaEm',
  CONTRATO: 'marcoContratoEm',
} as const;

export function buildSeedCrm(
  contatos: {
    pacientes: { id: string }[];
    profissionais: { id: string }[];
    origens: { id: string }[];
    responsaveis: { id: string }[];
  },
  agora: Date,
): SeedCrm {
  const pipelines: SeedCrm['pipelines'] = [];
  const estagios: SeedCrm['estagios'] = [];
  PIPELINES_PADRAO.forEach(([nome, defs], p) => {
    const pipelineId = faker.string.uuid();
    pipelines.push({ id: pipelineId, nome, ordem: p + 1 });
    defs.forEach(([nomeEstagio, cor, marco], e) => {
      estagios.push({
        id: faker.string.uuid(),
        pipelineId,
        nome: nomeEstagio,
        cor,
        marco,
        ordem: e + 1,
      });
    });
  });

  const motivosPerda = MOTIVOS_PERDA_PADRAO.map((nome, i) => ({
    id: faker.string.uuid(),
    nome,
    codigo: gerarCodigoOrigemCliente(nome),
    ordem: i + 1,
  }));

  const negocios: SeedCrm['negocios'] = [];
  const atividades: SeedCrm['atividades'] = [];
  for (let i = 0; i < 40; i++) {
    const estagio = estagios[(i * 7) % estagios.length];
    if (!estagio) continue;
    const status = i % 10 === 8 ? 'GANHO' : i % 10 === 9 ? 'PERDIDO' : 'ABERTO';
    const profissional = i % 2 === 0;
    const contato = profissional
      ? contatos.profissionais[i % Math.max(contatos.profissionais.length, 1)]
      : contatos.pacientes[i % Math.max(contatos.pacientes.length, 1)];
    const criado = new Date(agora.getTime() - (i + 1) * 86_400_000);
    const id = faker.string.uuid();
    const marcos =
      estagio.marco === null || estagio.marco === undefined
        ? {}
        : { [MARCO_COLUNA[estagio.marco]]: criado };
    negocios.push({
      id,
      pipelineId: estagio.pipelineId,
      estagioId: estagio.id,
      titulo: `${faker.helpers.arrayElement(SALAS)} - ${faker.helpers.arrayElement(AREAS)}`,
      valor: faker.helpers.arrayElement([840, 1160, 2300, 3360, 3850]),
      contatoTipo: contato ? (profissional ? 'PROFISSIONAL' : 'PACIENTE') : null,
      contatoId: contato?.id ?? null,
      responsavelId:
        contatos.responsaveis[i % Math.max(contatos.responsaveis.length, 1)]?.id ?? null,
      origemClienteId: contatos.origens[i % Math.max(contatos.origens.length, 1)]?.id ?? null,
      status,
      motivoPerdaId:
        status === 'PERDIDO' ? (motivosPerda[i % motivosPerda.length]?.id ?? null) : null,
      fechadoEm: status === 'ABERTO' ? null : agora,
      createdAt: criado,
      ...marcos,
    });
    // Abertos: um terço sem próxima ação, um terço atrasado e um terço em dia.
    if (status === 'ABERTO' && i % 3 !== 0) {
      const deslocamentoDias = i % 3 === 1 ? -2 : 3;
      atividades.push({
        id: faker.string.uuid(),
        negocioId: id,
        tipo: 'FOLLOW_UP',
        titulo: 'Retornar contato',
        dataHora: new Date(agora.getTime() + deslocamentoDias * 86_400_000),
        responsavelId: contatos.responsaveis[0]?.id ?? null,
      });
    }
  }

  return { pipelines, estagios, motivosPerda, negocios, atividades };
}

type Upsert<T> = (args: { where: { id: string }; create: T; update: T }) => Promise<unknown>;

async function upsertPorId<T extends { id: string }>(registros: T[], upsert: Upsert<T>) {
  for (const registro of registros) {
    await upsert({ where: { id: registro.id }, create: registro, update: registro });
  }
}

/** Idempotente: upsert pelos ids determinísticos, na ordem das FKs. */
export async function applySeedCrm(tx: Prisma.TransactionClient, dados: SeedCrm): Promise<void> {
  await upsertPorId(dados.pipelines, (a) => tx.pipeline.upsert(a));
  await upsertPorId(dados.estagios, (a) => tx.estagioPipeline.upsert(a));
  await upsertPorId(dados.motivosPerda, (a) => tx.motivoPerda.upsert(a));
  await upsertPorId(dados.negocios, (a) => tx.negocio.upsert(a));
  await upsertPorId(dados.atividades, (a) => tx.atividadeNegocio.upsert(a));
}
