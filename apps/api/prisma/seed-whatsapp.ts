import { fakerPT_BR as faker } from '@faker-js/faker';
import type { ConversaWhatsappStatus, Prisma } from '../src/generated/prisma/client';

/**
 * Atendimento WhatsApp do seed (issue #16), 100% fictício: canais, contatos (parte deles
 * pacientes do seed), conversas em cada status, mensagens e tags.
 */

type ComId<T> = T & { id: string };

export interface SeedWhatsapp {
  canaisWhatsapp: ComId<Prisma.CanalWhatsappUncheckedCreateInput>[];
  contatosWhatsapp: ComId<Prisma.ContatoWhatsappUncheckedCreateInput>[];
  conversasWhatsapp: ComId<Prisma.ConversaWhatsappUncheckedCreateInput>[];
  mensagensWhatsapp: ComId<Prisma.MensagemWhatsappUncheckedCreateInput>[];
  tagsAtendimento: ComId<Prisma.TagAtendimentoUncheckedCreateInput>[];
}

const CANAIS = ['Recepção', 'Gerência', 'Consultório 1', 'Consultório 2'];
const TAGS: [string, string][] = [
  ['Retorno', '#3b82f6'],
  ['Orçamento', '#f59e0b'],
  ['Prioridade', '#ef4444'],
];
const STATUS: ConversaWhatsappStatus[] = ['AGUARDANDO', 'EM_ATENDIMENTO', 'FINALIZADA', 'BOT'];
// Mensagens genéricas, sem dados pessoais.
const RECEBIDAS = [
  'Olá, gostaria de agendar uma consulta.',
  'Vocês atendem no sábado?',
  'Qual o valor da avaliação?',
  'Obrigado!',
  'Posso remarcar para a próxima semana?',
];
const ENVIADAS = [
  'Olá! Como podemos ajudar?',
  'Temos horários disponíveis na quinta-feira.',
  'Seu agendamento está confirmado.',
  'Disponha!',
];

/** Número de WhatsApp fictício com DDI 55. */
function numeroWhatsapp(): string {
  return `55${faker.helpers.fromRegExp(/[1-9]{2}9[0-9]{8}/)}`;
}

export function buildSeedWhatsapp(
  pacientes: { id: string; telefone?: string | null }[],
  agora: Date,
): SeedWhatsapp {
  const canaisWhatsapp = CANAIS.map((nome) => ({
    id: faker.string.uuid(),
    nome,
    numero: numeroWhatsapp(),
    status: 'CONECTADO' as const,
  }));
  const tagsAtendimento = TAGS.map(([nome, cor]) => ({ id: faker.string.uuid(), nome, cor }));

  // Metade dos contatos são pacientes do seed (mesmo telefone); os demais, só contatos.
  const contatosWhatsapp = Array.from({ length: 24 }, (_, i) => {
    const paciente = i % 2 === 0 ? pacientes[i] : undefined;
    return {
      id: faker.string.uuid(),
      nome: i % 6 === 5 ? null : faker.person.fullName(),
      telefone: paciente?.telefone ? `55${paciente.telefone}` : numeroWhatsapp(),
      pacienteId: paciente?.id ?? null,
    };
  });

  const mensagensWhatsapp: SeedWhatsapp['mensagensWhatsapp'] = [];
  const conversasWhatsapp = contatosWhatsapp.map((contato, i) => {
    const id = faker.string.uuid();
    const status = STATUS[i % STATUS.length] ?? 'AGUARDANDO';
    // Uma conversa a cada ~3 horas para trás: hoje, ontem, dias da semana e datas antigas.
    const ultima = new Date(agora.getTime() - i * 3 * 60 * 60 * 1000);
    for (let m = 2; m >= 0; m--) {
      const recebida = m % 2 === 0;
      mensagensWhatsapp.push({
        id: faker.string.uuid(),
        conversaId: id,
        direcao: recebida ? 'RECEBIDA' : 'ENVIADA',
        conteudo: faker.helpers.arrayElement(recebida ? RECEBIDAS : ENVIADAS),
        enviadaEm: new Date(ultima.getTime() - m * 5 * 60 * 1000),
      });
    }
    return {
      id,
      contatoId: contato.id,
      canalId: canaisWhatsapp[i % canaisWhatsapp.length]?.id ?? '',
      status,
      naoLidas: status === 'AGUARDANDO' ? (i % 12) + 1 : 0,
      ultimaMensagemEm: ultima,
    };
  });

  return {
    canaisWhatsapp,
    contatosWhatsapp,
    conversasWhatsapp,
    mensagensWhatsapp,
    tagsAtendimento,
  };
}

type Upsert<T> = (args: { where: { id: string }; create: T; update: T }) => Promise<unknown>;

async function upsertPorId<T extends { id: string }>(registros: T[], upsert: Upsert<T>) {
  for (const registro of registros) {
    await upsert({ where: { id: registro.id }, create: registro, update: registro });
  }
}

/** Idempotente: upsert pelos ids determinísticos, na ordem das FKs. */
export async function applySeedWhatsapp(
  tx: Prisma.TransactionClient,
  dados: SeedWhatsapp,
): Promise<void> {
  await upsertPorId(dados.canaisWhatsapp, (a) => tx.canalWhatsapp.upsert(a));
  await upsertPorId(dados.tagsAtendimento, (a) => tx.tagAtendimento.upsert(a));
  await upsertPorId(dados.contatosWhatsapp, (a) => tx.contatoWhatsapp.upsert(a));
  await upsertPorId(dados.conversasWhatsapp, (a) => tx.conversaWhatsapp.upsert(a));
  await upsertPorId(dados.mensagensWhatsapp, (a) => tx.mensagemWhatsapp.upsert(a));
  // Uma tag em cada 3 conversas, para a busca por tag do modal "Buscar Conversas".
  await tx.conversaTag.createMany({
    data: dados.conversasWhatsapp
      .filter((_, i) => i % 3 === 0)
      .map((conversa, i) => ({
        conversaId: conversa.id,
        tagId: dados.tagsAtendimento[i % dados.tagsAtendimento.length]?.id ?? '',
      })),
    skipDuplicates: true,
  });
}
