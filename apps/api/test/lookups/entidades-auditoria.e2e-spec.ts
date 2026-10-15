import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import {
  EntidadesCompartilhadasFixtureModule,
  type EntidadeCompartilhada,
} from '../fixtures/entidades-compartilhadas-fixture.module';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';
import { expectAudit } from '../utils/expect-audit';

/** Corpo mínimo de criação de cada entidade (o resto tem default no banco). */
const CORPOS: Record<EntidadeCompartilhada, Record<string, unknown>> = {
  Paciente: { nome: 'Paciente Auditado', documento: '12345678901' },
  Especialidade: { nome: 'Especialidade Auditada' },
  Profissional: { nome: 'Profissional Auditado', registro: 'CRM 1' },
  Fornecedor: { nome: 'Fornecedor Auditado', uf: 'MT' },
  Categoria: { nome: 'Categoria Auditada', tipo: 'PRODUTO' },
  UnidadeMedida: { nome: 'Unidade', sigla: 'UN' },
  Produto: { nome: 'Produto Auditado', tipo: 'PRODUTO', precoVenda: '12.50' },
  Cargo: { nome: 'Cargo Auditado' },
  Funcionario: { nome: 'Funcionário Auditado' },
  FormaPagamento: { nome: 'Forma Auditada', finalidade: 'RECEBER', tipo: 'PIX' },
  TipoAgendamento: { nome: 'Tipo Auditado', duracaoMinutos: 30 },
};

const ENTIDADES = Object.keys(CORPOS) as EntidadeCompartilhada[];

/** Decimal vai para o audit_log como string. */
function esperado(corpo: Record<string, unknown>): Record<string, unknown> {
  return corpo.precoVenda ? { ...corpo, precoVenda: '12.5' } : corpo;
}

describe('Auditoria das entidades compartilhadas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;

  beforeAll(async () => {
    app = await createE2eApp({ imports: [EntidadesCompartilhadasFixtureModule] });
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(ENTIDADES)('%s: CREATE, UPDATE e DELETE gravam before/after', async (entidade) => {
    const base = `/api/test-fixtures/entidades/${entidade}`;
    const http = comUsuario(app, usuario);
    const corpo = CORPOS[entidade];

    const criado = await http.post(base).send(corpo).expect(201);
    const id: string = criado.body.id;
    await http.patch(`${base}/${id}`).send({ nome: 'Nome Alterado' }).expect(200);
    await http.delete(`${base}/${id}`).expect(200);

    await expectAudit(prisma, {
      action: 'CREATE',
      entity: entidade,
      entityId: id,
      before: null,
      after: { id, ...esperado(corpo), deletedAt: null },
      userId: usuario.id,
    });
    await expectAudit(prisma, {
      action: 'UPDATE',
      entity: entidade,
      entityId: id,
      before: { nome: corpo.nome },
      after: { nome: 'Nome Alterado' },
    });
    const exclusao = await expectAudit(prisma, {
      action: 'DELETE',
      entity: entidade,
      entityId: id,
      before: { id, nome: 'Nome Alterado', deletedAt: null },
      after: null,
    });
    expect(exclusao.userId).toBe(usuario.id);
  });
});
