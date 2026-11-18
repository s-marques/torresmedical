import type { INestApplication } from '@nestjs/common';
import { grupoWhatsappPageSchema } from '@torres/shared';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { comUsuario, criarUsuarioTeste, type UsuarioTeste } from '../utils/auth';
import { createE2eApp } from '../utils/create-e2e-app';
import { truncateAll } from '../utils/database';

const BASE = '/api/comercial-atendimento/grupos-whatsapp';
const INEXISTENTE = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

describe('Grupos WhatsApp (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let usuario: UsuarioTeste;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    usuario = await criarUsuarioTeste(app, {
      permissoes: ['comercial-atendimento.grupos-whatsapp.ver'],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => comUsuario(app, usuario);
  const canal = (nome = 'Recepção', numero = '5565999990001') =>
    prisma.canalWhatsapp.create({ data: { nome, numero } });

  it('200: lista paginada no contrato padrão (vazia até a integração existir)', async () => {
    const c = await canal();
    const res = await http().get(BASE).query({ canalId: c.id }).expect(200);
    const pagina = grupoWhatsappPageSchema.parse(res.body);
    expect(pagina.data).toEqual([]);
    expect(pagina.meta).toEqual({ page: 1, pageSize: 10, total: 0, totalPages: 0 });
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it('400: sem canal, canal inválido ou ordenação fora da whitelist', async () => {
    const c = await canal();
    await http().get(BASE).expect(400);
    await http().get(BASE).query({ canalId: 'abc' }).expect(400);
    await http().get(BASE).query({ canalId: c.id, sort: 'id:asc' }).expect(400);
  });

  it('403: sem a permissão da tela', async () => {
    const c = await canal();
    const sem = await criarUsuarioTeste(app, { permissoes: [] });
    await comUsuario(app, sem).get(BASE).query({ canalId: c.id }).expect(403);
  });

  it('404: canal inexistente ou excluído', async () => {
    const excluido = await canal('Antigo', '5565999990002');
    await prisma.canalWhatsapp.update({
      where: { id: excluido.id },
      data: { deletedAt: new Date() },
    });
    await http().get(BASE).query({ canalId: INEXISTENTE }).expect(404);
    await http().get(BASE).query({ canalId: excluido.id }).expect(404);
  });

  it('404: canal restrito a outros usuários; liberado quando o usuário está vinculado', async () => {
    const c = await canal('Gerência', '5565999990003');
    const outro = await criarUsuarioTeste(app, { permissoes: [] });
    await prisma.canalWhatsappUsuario.create({ data: { canalId: c.id, usuarioId: outro.id } });
    await http().get(BASE).query({ canalId: c.id }).expect(404);

    await prisma.canalWhatsappUsuario.create({ data: { canalId: c.id, usuarioId: usuario.id } });
    await http().get(BASE).query({ canalId: c.id }).expect(200);
  });
});
