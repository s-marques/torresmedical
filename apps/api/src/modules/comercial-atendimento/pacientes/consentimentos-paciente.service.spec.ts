import type { TransactionHost } from '@nestjs-cls/transactional';
import type { AuditService } from '../../../common/audit/audit.service';
import type { RequestContextService } from '../../../common/context/request-context.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { UsuariosLookupService } from '../../configuracoes-gestao/usuarios/usuarios.service';
import type { PacientesVinculadosService } from '../../consultorio-assistencial/pacientes-vinculados/pacientes-vinculados.service';
import { ConsentimentosPacienteService } from './consentimentos-paciente.service';

const PACIENTE_ID = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const USUARIO_ID = '7b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

function registro(extra: Record<string, unknown> = {}) {
  return {
    id: '8b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
    pacienteId: PACIENTE_ID,
    tipo: 'CAMPANHAS',
    aceito: false,
    canal: 'PRESENCIAL',
    versao: '1',
    observacao: null,
    registradoPorId: USUARIO_ID,
    registradoEm: new Date('2026-11-24T12:00:00.000Z'),
    ...extra,
  };
}

function setup({ paciente = { id: PACIENTE_ID }, vigente = null as unknown } = {}) {
  const consentimento = {
    findMany: jest.fn().mockResolvedValue([registro()]),
    findFirst: jest.fn().mockResolvedValue(vigente),
    create: jest.fn().mockImplementation(({ data }) => Promise.resolve(registro(data))),
  };
  const pacienteDelegate = {
    findFirst: jest.fn().mockResolvedValue(paciente),
    update: jest.fn().mockResolvedValue({}),
  };
  const txHost = {
    tx: { consentimentoPaciente: consentimento, paciente: pacienteDelegate },
  } as unknown as TransactionHost<PrismaAdapter>;
  const usuarios = {
    nomesPorIds: jest.fn().mockResolvedValue(new Map([[USUARIO_ID, 'Atendente Fictícia']])),
  };
  const contexto = { getUserId: jest.fn().mockReturnValue(USUARIO_ID) };
  const vinculados = { garantir: jest.fn().mockResolvedValue(undefined) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new ConsentimentosPacienteService(
    txHost,
    usuarios as unknown as UsuariosLookupService,
    contexto as unknown as RequestContextService,
    vinculados as unknown as PacientesVinculadosService,
    audit as unknown as AuditService,
  );
  return { service, consentimento, pacienteDelegate, usuarios, vinculados, audit, contexto };
}

const REVOGAR_CAMPANHAS = {
  tipo: 'CAMPANHAS',
  aceito: false,
  canal: 'WHATSAPP',
  observacao: 'Pediu para parar',
} as const;

describe('ConsentimentosPacienteService', () => {
  it('listar: histórico com o nome de quem registrou, respeitando o escopo', async () => {
    const { service, consentimento, vinculados } = setup();

    const { data } = await service.listar(PACIENTE_ID);

    expect(vinculados.garantir).toHaveBeenCalledWith(PACIENTE_ID);
    expect(consentimento.findMany.mock.calls[0][0].orderBy).toEqual([
      { registradoEm: 'desc' },
      { id: 'desc' },
    ]);
    expect(data[0]).toMatchObject({
      tipo: 'CAMPANHAS',
      aceito: false,
      registradoPorNome: 'Atendente Fictícia',
      registradoEm: '2026-11-24T12:00:00.000Z',
    });
  });

  it('listar: paciente inexistente dá 404 e paciente fora do escopo, 403', async () => {
    const naoExiste = setup({ paciente: null as never });
    await expect(naoExiste.service.listar(PACIENTE_ID)).rejects.toMatchObject({ status: 404 });
    await expect(naoExiste.service.listar('não-é-uuid')).rejects.toMatchObject({ status: 404 });

    const foraDoEscopo = setup();
    foraDoEscopo.vinculados.garantir.mockRejectedValue(
      Object.assign(new Error('Sem permissão'), { status: 403 }),
    );
    await expect(foraDoEscopo.service.listar(PACIENTE_ID)).rejects.toMatchObject({ status: 403 });
    expect(foraDoEscopo.consentimento.findMany).not.toHaveBeenCalled();
  });

  it('registrar: revogar campanhas grava o registro e desliga o espelho do cadastro', async () => {
    const { service, consentimento, pacienteDelegate } = setup();

    const criado = await service.registrar(PACIENTE_ID, { ...REVOGAR_CAMPANHAS });

    expect(consentimento.create.mock.calls[0][0].data).toMatchObject({
      pacienteId: PACIENTE_ID,
      tipo: 'CAMPANHAS',
      aceito: false,
      canal: 'WHATSAPP',
      versao: '1',
      registradoPorId: USUARIO_ID,
    });
    expect(pacienteDelegate.update).toHaveBeenCalledWith({
      where: { id: PACIENTE_ID },
      data: { aceitaCampanhasWhatsapp: false },
    });
    expect(criado.registradoPorNome).toBe('Atendente Fictícia');
  });

  it('registrar: comunicação atualiza o espelho próprio; tratamento de dados não mexe no cadastro', async () => {
    const { service, pacienteDelegate } = setup();

    await service.registrar(PACIENTE_ID, { ...REVOGAR_CAMPANHAS, tipo: 'COMUNICACAO' });
    expect(pacienteDelegate.update).toHaveBeenLastCalledWith({
      where: { id: PACIENTE_ID },
      data: { aceitaComunicacao: false },
    });

    pacienteDelegate.update.mockClear();
    await service.registrar(PACIENTE_ID, { ...REVOGAR_CAMPANHAS, tipo: 'TRATAMENTO_DADOS' });
    expect(pacienteDelegate.update).not.toHaveBeenCalled();
  });

  it('registrar: sem usuário no contexto (rotina) grava sem autor', async () => {
    const { service, consentimento, contexto } = setup();
    contexto.getUserId.mockReturnValue(undefined);

    await service.registrar(PACIENTE_ID, { ...REVOGAR_CAMPANHAS });

    expect(consentimento.create.mock.calls[0][0].data.registradoPorId).toBeNull();
  });

  describe('registrarSeMudou', () => {
    it('sem registro anterior do tipo: grava e audita', async () => {
      const { service, consentimento, audit } = setup({ vigente: null });

      await expect(service.registrarSeMudou(PACIENTE_ID, { ...REVOGAR_CAMPANHAS })).resolves.toBe(
        true,
      );

      expect(consentimento.create).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entity: 'ConsentimentoPaciente',
          before: null,
        }),
      );
    });

    it('mesmo valor do vigente: não grava de novo (o histórico não ganha duplicatas)', async () => {
      const { service, consentimento, audit } = setup({ vigente: { aceito: false } });

      await expect(service.registrarSeMudou(PACIENTE_ID, { ...REVOGAR_CAMPANHAS })).resolves.toBe(
        false,
      );

      expect(consentimento.create).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('valor diferente do vigente: grava um novo registro (reaceite depois da revogação)', async () => {
      const { service, consentimento } = setup({ vigente: { aceito: false } });

      await expect(
        service.registrarSeMudou(PACIENTE_ID, { ...REVOGAR_CAMPANHAS, aceito: true }),
      ).resolves.toBe(true);

      expect(consentimento.create.mock.calls[0][0].data.aceito).toBe(true);
    });
  });
});
