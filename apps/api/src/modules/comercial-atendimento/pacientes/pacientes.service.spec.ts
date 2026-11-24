import { CONSULTA_LOOKUP, txHostFalso } from '../../../../test/utils/tx-host-falso';
import type { EscopoDadosService } from '../../../common/auth/escopo-dados.service';
import type { ExportService } from '../../../common/export/export.service';
import type { EspecialidadesService } from '../../gestao-profissionais/especialidades/especialidades.service';
import type { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import type { ConsentimentosPacienteService } from './consentimentos-paciente.service';
import type { PacientesDuplicidadeService } from './pacientes-duplicidade.service';
import type { PacientesVinculadosService } from '../../consultorio-assistencial/pacientes-vinculados/pacientes-vinculados.service';
import {
  formatarDocumento,
  mascararCpf,
  PacientesService,
  toPacienteDto,
} from './pacientes.service';

const PACIENTE = {
  id: '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  nome: 'Maria Teste',
  documento: '12345678901',
  status: 'ATIVO',
};

function setup(registros = [PACIENTE], idsNoEscopo: string[] | null = null) {
  const { txHost, delegate } = txHostFalso('paciente', registros);
  const vinculados = {
    idsNoEscopo: jest.fn().mockResolvedValue(idsNoEscopo),
    garantir: jest.fn(async (id: string) => {
      if (idsNoEscopo !== null && !idsNoEscopo.includes(id)) {
        throw Object.assign(new Error('Sem permissão'), { status: 403 });
      }
    }),
  };
  const agendamentos = { groupBy: jest.fn().mockResolvedValue([]) };
  (txHost.tx as unknown as Record<string, unknown>).agendamento = agendamentos;
  const profissionais = { nomesPorIds: jest.fn().mockResolvedValue(new Map()) };
  const especialidades = { nomesPorIds: jest.fn().mockResolvedValue(new Map()) };
  const escopo = { garantirProfissional: jest.fn() };
  const consentimentos = { registrarSeMudou: jest.fn().mockResolvedValue(true) };
  const duplicidade = {
    exigirConfirmacao: jest.fn().mockResolvedValue([]),
    registrarConfirmacao: jest.fn().mockResolvedValue(undefined),
  };
  const service = new PacientesService(
    txHost,
    {} as ExportService,
    vinculados as unknown as PacientesVinculadosService,
    escopo as unknown as EscopoDadosService,
    profissionais as unknown as ProfissionaisService,
    especialidades as unknown as EspecialidadesService,
    consentimentos as unknown as ConsentimentosPacienteService,
    duplicidade as unknown as PacientesDuplicidadeService,
  );
  return {
    service,
    delegate,
    vinculados,
    agendamentos,
    profissionais,
    especialidades,
    escopo,
    consentimentos,
    duplicidade,
  };
}

describe('PacientesService', () => {
  it('lookup: só ativos, busca por nome ou pelos dígitos do CPF, CPF mascarado', async () => {
    const { service, delegate } = setup();

    const page = await service.lookup({ ...CONSULTA_LOOKUP, search: '345.678' });

    expect(delegate.count).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        status: { not: 'INATIVO' },
        OR: [
          { nome: { contains: '345.678', mode: 'insensitive' } },
          { documento: { contains: '345678' } },
        ],
      },
    });
    expect(page.data).toEqual([
      { id: PACIENTE.id, label: 'Maria Teste', descricao: '***.456.789-**' },
    ]);
  });

  it('busca sem dígitos procura só no nome; sem busca não filtra texto', async () => {
    const { service, delegate } = setup();

    await service.lookup({ ...CONSULTA_LOOKUP, search: 'maria' });
    await service.lookup(CONSULTA_LOOKUP);

    expect(delegate.count.mock.calls[0][0].where.OR).toEqual([
      { nome: { contains: 'maria', mode: 'insensitive' } },
    ]);
    expect(delegate.count.mock.calls[1][0].where).toEqual({
      deletedAt: null,
      status: { not: 'INATIVO' },
    });
  });

  it('contar: total de pacientes não excluídos, ativos ou não', async () => {
    const { service, delegate } = setup();

    await service.contar();

    expect(delegate.count).toHaveBeenCalledWith({ where: { deletedAt: null } });
  });

  it('findLookupById e 404', async () => {
    await expect(setup().service.findLookupById(PACIENTE.id)).resolves.toMatchObject({
      label: 'Maria Teste',
    });
    await expect(setup([]).service.findById(PACIENTE.id)).rejects.toMatchObject({
      message: 'Paciente não encontrado',
    });
  });

  it('mascararCpf só para CPF com 11 dígitos', () => {
    expect(mascararCpf('98765432100')).toBe('***.654.321-**');
    expect(mascararCpf('11222333000181')).toBeNull();
    expect(mascararCpf(null)).toBeNull();
  });

  it('formatarDocumento: CPF, CNPJ e valores fora do padrão', () => {
    expect(formatarDocumento('52998224725')).toBe('529.982.247-25');
    expect(formatarDocumento('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatarDocumento('123')).toBe('123');
    expect(formatarDocumento(null)).toBeNull();
  });

  it('toPacienteDto: data só com dia, nome da origem e sem deletedAt', () => {
    const agora = new Date('2026-10-20T12:00:00.000Z');
    const dto = toPacienteDto({
      ...PACIENTE,
      dataNascimento: new Date('1990-05-17T00:00:00.000Z'),
      origemCliente: { nome: 'Google' },
      createdAt: agora,
      updatedAt: agora,
      deletedAt: null,
    } as never);

    expect(dto).toMatchObject({
      dataNascimento: '1990-05-17',
      origemNome: 'Google',
      createdAt: agora.toISOString(),
    });
    expect(dto).not.toHaveProperty('deletedAt');
    expect(dto).not.toHaveProperty('origemCliente');
  });

  it('list: ordena a origem pelo nome dela e o telefone pelo celular', async () => {
    const agora = new Date();
    const { service, delegate } = setup([
      { ...PACIENTE, createdAt: agora, updatedAt: agora, origemCliente: null } as never,
    ]);
    const consulta = { page: 1, pageSize: 10, search: undefined, status: undefined };

    await service.list({ ...consulta, sort: { field: 'origem', direction: 'desc' } });
    await service.list({ ...consulta, sort: { field: 'telefone', direction: 'asc' } });

    expect(delegate.findMany.mock.calls[0][0].orderBy).toEqual([
      { origemCliente: { nome: 'desc' } },
      { id: 'desc' },
    ]);
    expect(delegate.findMany.mock.calls[1][0].orderBy).toEqual([{ celular: 'asc' }, { id: 'asc' }]);
  });

  describe('relacionamento (issue #148)', () => {
    const agora = new Date();
    const COMPLETO = {
      ...PACIENTE,
      createdAt: agora,
      updatedAt: agora,
      origemCliente: null,
      indicacaoTipo: null,
      indicacaoReferenciaId: null,
      profissionalVinculoId: null,
      especialidadeVinculoId: null,
    } as never;
    const consulta = {
      page: 1,
      pageSize: 10,
      search: undefined,
      status: undefined,
      sort: { field: 'nome' as const, direction: 'asc' as const },
    };
    const ID_A = '1b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
    const ID_B = '2b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

    it('list: filtros de origem, canal e período de cadastro (dias inteiros)', async () => {
      const { service, delegate } = setup([COMPLETO]);

      await service.list({
        ...consulta,
        origemClienteId: ID_A,
        canalOrigem: 'WHATSAPP',
        novosDe: '2026-11-01',
        novosAte: '2026-11-30',
      });

      const where = delegate.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ origemClienteId: ID_A, canalOrigem: 'WHATSAPP' });
      expect(where.createdAt.gte.toISOString()).toBe('2026-11-01T03:00:00.000Z');
      expect(where.createdAt.lt.toISOString()).toBe('2026-12-01T03:00:00.000Z');
    });

    it('list: sem retorno há N dias = já atendido, último atendimento antigo, nada à frente', async () => {
      const { service, delegate } = setup([COMPLETO]);

      await service.list({ ...consulta, semRetornoDias: 90 });

      const filtro = delegate.findMany.mock.calls[0][0].where.AND[0].agendamentos;
      expect(filtro.some).toEqual({ status: 'ATENDIDO', deletedAt: null });
      const [recente, futuro] = filtro.none.OR;
      expect(recente.status).toBe('ATENDIDO');
      const dias = (Date.now() - recente.inicio.gte.getTime()) / 86_400_000;
      expect(Math.round(dias)).toBe(90);
      expect(futuro.status.notIn).toEqual(['CANCELADO', 'REAGENDAR', 'FALTOU', 'ATENDIDO']);
    });

    it('list: com faltas exige ao menos uma falta; false não filtra', async () => {
      const { service, delegate } = setup([COMPLETO]);

      await service.list({ ...consulta, comFaltas: true });
      await service.list({ ...consulta, comFaltas: false });

      expect(delegate.findMany.mock.calls[0][0].where.AND).toEqual([
        { agendamentos: { some: { status: 'FALTOU', deletedAt: null } } },
      ]);
      expect(delegate.findMany.mock.calls[1][0].where).not.toHaveProperty('AND');
    });

    it('list: calcula primeiro e último atendimento, próximo retorno e faltas', async () => {
      const { service, agendamentos } = setup([COMPLETO]);
      const primeiro = new Date('2026-01-10T13:00:00.000Z');
      const ultimo = new Date('2026-08-20T13:00:00.000Z');
      const proximo = new Date('2027-01-05T13:00:00.000Z');
      agendamentos.groupBy
        .mockResolvedValueOnce([
          { pacienteId: PACIENTE.id, _min: { inicio: primeiro }, _max: { inicio: ultimo } },
        ])
        .mockResolvedValueOnce([{ pacienteId: PACIENTE.id, _count: { _all: 2 } }])
        .mockResolvedValueOnce([{ pacienteId: PACIENTE.id, _min: { inicio: proximo } }]);

      const { data } = await service.list(consulta);

      expect(data[0]).toMatchObject({
        primeiroAtendimento: primeiro.toISOString(),
        ultimoAtendimento: ultimo.toISOString(),
        proximoRetorno: proximo.toISOString(),
        faltas: 2,
      });
    });

    it('list: paciente sem agendamentos fica com datas nulas e zero faltas', async () => {
      const { service } = setup([COMPLETO]);

      const { data } = await service.list(consulta);

      expect(data[0]).toMatchObject({
        primeiroAtendimento: null,
        ultimoAtendimento: null,
        proximoRetorno: null,
        faltas: 0,
      });
    });

    it('list: resolve os nomes de quem indicou, do profissional e da especialidade', async () => {
      const registro = {
        ...(COMPLETO as object),
        indicacaoTipo: 'PROFISSIONAL',
        indicacaoReferenciaId: ID_A,
        profissionalVinculoId: ID_A,
        especialidadeVinculoId: ID_B,
      } as never;
      const { service, profissionais, especialidades } = setup([registro]);
      profissionais.nomesPorIds.mockResolvedValue(new Map([[ID_A, 'Dra. Fictícia']]));
      especialidades.nomesPorIds.mockResolvedValue(new Map([[ID_B, 'Nutrologia']]));

      const { data } = await service.list(consulta);

      expect(data[0]).toMatchObject({
        indicacaoNome: 'Dra. Fictícia',
        profissionalVinculoNome: 'Dra. Fictícia',
        especialidadeVinculoNome: 'Nutrologia',
      });
    });

    it('toPacienteDto: indicação em texto livre usa o próprio texto', () => {
      const dto = toPacienteDto({
        ...PACIENTE,
        indicacaoTipo: 'TEXTO',
        indicacaoTexto: 'Vizinho da clínica',
        createdAt: agora,
        updatedAt: agora,
        origemCliente: null,
        deletedAt: null,
      } as never);
      expect(dto.indicacaoNome).toBe('Vizinho da clínica');
    });

    it('create: grava os consentimentos informados e não os leva para a tabela de pacientes', async () => {
      const { service, delegate, consentimentos } = setup([COMPLETO]);
      const consentimento = {
        tipo: 'CAMPANHAS',
        aceito: false,
        canal: 'PRESENCIAL',
        observacao: null,
      };

      await service.create({
        nome: 'Ana Teste',
        consentimentos: [consentimento],
        aceitaCampanhasWhatsapp: true,
      } as never);

      const data = delegate.create.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('consentimentos');
      expect(data).not.toHaveProperty('aceitaCampanhasWhatsapp');
      expect(consentimentos.registrarSeMudou).toHaveBeenNthCalledWith(
        1,
        PACIENTE.id,
        consentimento,
      );
      expect(consentimentos.registrarSeMudou).toHaveBeenNthCalledWith(2, PACIENTE.id, {
        tipo: 'CAMPANHAS',
        aceito: true,
        canal: 'OUTRO',
        observacao: null,
      });
    });

    it('create: sem consentimento informado não grava registro', async () => {
      const { service, consentimentos } = setup([COMPLETO]);
      await service.create({ nome: 'Ana Teste' } as never);
      expect(consentimentos.registrarSeMudou).not.toHaveBeenCalled();
    });

    it('create: indicação por paciente ou profissional inexistente dá 400', async () => {
      const { service, delegate } = setup([COMPLETO]);
      delegate.findFirst.mockResolvedValue(null);

      for (const indicacaoTipo of ['PACIENTE', 'PROFISSIONAL']) {
        await expect(
          service.create({ nome: 'Ana', indicacaoTipo, indicacaoReferenciaId: ID_A } as never),
        ).rejects.toMatchObject({ status: 400, code: 'PACIENTE_INDICACAO_INVALIDA' });
      }
      expect(delegate.create).not.toHaveBeenCalled();
    });

    it('update: o paciente não pode indicar a si mesmo', async () => {
      const { service } = setup([COMPLETO]);
      await expect(
        service.update(PACIENTE.id, {
          nome: 'Ana',
          indicacaoTipo: 'PACIENTE',
          indicacaoReferenciaId: PACIENTE.id,
        } as never),
      ).rejects.toMatchObject({ status: 400, code: 'PACIENTE_INDICACAO_INVALIDA' });
    });

    it('create: profissional e especialidade de vínculo precisam existir', async () => {
      const { service } = setup([COMPLETO]);
      await expect(
        service.create({ nome: 'Ana', profissionalVinculoId: ID_A } as never),
      ).rejects.toMatchObject({ status: 400, code: 'PACIENTE_PROFISSIONAL_INVALIDO' });
      await expect(
        service.create({ nome: 'Ana', especialidadeVinculoId: ID_A } as never),
      ).rejects.toMatchObject({ status: 400, code: 'PACIENTE_ESPECIALIDADE_INVALIDA' });
    });

    it('create: vínculo com profissional fora do escopo é barrado pelo escopo de dados', async () => {
      const { service, profissionais, escopo } = setup([COMPLETO]);
      profissionais.nomesPorIds.mockResolvedValue(new Map([[ID_A, 'Dr. Fictício']]));
      escopo.garantirProfissional.mockImplementation(() => {
        throw Object.assign(new Error('Sem permissão'), { status: 403 });
      });
      await expect(
        service.create({ nome: 'Ana', profissionalVinculoId: ID_A } as never),
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  describe('possível duplicado (issue #149)', () => {
    const agora = new Date();
    const GRAVADO = { ...PACIENTE, createdAt: agora, updatedAt: agora, origemCliente: null };
    const CANDIDATO = {
      id: '1b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
      nome: 'Outra Pessoa',
      cpfMascarado: null,
      dataNascimento: null,
      motivos: ['TELEFONE' as const],
    };

    it('create: confere o duplicado, não grava o flag e registra a confirmação', async () => {
      const { service, delegate, duplicidade } = setup([GRAVADO as never]);
      duplicidade.exigirConfirmacao.mockResolvedValue([CANDIDATO]);

      await service.create({ nome: 'Maria Teste', duplicidadeConfirmada: true } as never);

      expect(duplicidade.exigirConfirmacao).toHaveBeenCalledWith(
        expect.objectContaining({ nome: 'Maria Teste' }),
        true,
      );
      expect(delegate.create.mock.calls[0][0].data).not.toHaveProperty('duplicidadeConfirmada');
      expect(duplicidade.registrarConfirmacao).toHaveBeenCalledWith(PACIENTE.id, [CANDIDATO]);
    });

    it('create: o 409 do duplicado impede a gravação', async () => {
      const { service, delegate, duplicidade } = setup([GRAVADO as never]);
      duplicidade.exigirConfirmacao.mockRejectedValue(
        Object.assign(new Error('duplicado'), { status: 409 }),
      );

      await expect(service.create({ nome: 'Maria' } as never)).rejects.toMatchObject({
        status: 409,
      });
      expect(delegate.create).not.toHaveBeenCalled();
      expect(duplicidade.registrarConfirmacao).not.toHaveBeenCalled();
    });

    it('update: ignora o próprio paciente e registra a confirmação', async () => {
      const { service, delegate, duplicidade } = setup([GRAVADO as never]);
      duplicidade.exigirConfirmacao.mockResolvedValue([CANDIDATO]);

      await service.update(PACIENTE.id, {
        nome: 'Maria Teste',
        duplicidadeConfirmada: true,
      } as never);

      expect(duplicidade.exigirConfirmacao).toHaveBeenCalledWith(
        expect.objectContaining({ nome: 'Maria Teste' }),
        true,
        PACIENTE.id,
      );
      expect(delegate.update.mock.calls[0][0].data).not.toHaveProperty('duplicidadeConfirmada');
      expect(duplicidade.registrarConfirmacao).toHaveBeenCalledWith(PACIENTE.id, [CANDIDATO]);
    });
  });

  describe('escopo de dados (issue #153)', () => {
    const consulta = {
      page: 1,
      pageSize: 10,
      search: undefined,
      status: undefined,
      sort: { field: 'nome' as const, direction: 'asc' as const },
    };
    const OUTRO = '9b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
    const agora = new Date();
    const COMPLETO = {
      ...PACIENTE,
      createdAt: agora,
      updatedAt: agora,
      origemCliente: null,
    } as never;

    it('list: sem restrição não filtra por id', async () => {
      const { service, delegate } = setup([COMPLETO]);
      await service.list(consulta);
      expect(delegate.findMany.mock.calls[0][0].where).not.toHaveProperty('AND');
    });

    it('list: restrito lista só os pacientes vinculados', async () => {
      const { service, delegate } = setup([COMPLETO], [PACIENTE.id]);
      await service.list(consulta);
      expect(delegate.findMany.mock.calls[0][0].where.AND[1]).toEqual({
        id: { in: [PACIENTE.id] },
      });
      expect(delegate.count.mock.calls[0][0].where.AND[1]).toEqual({ id: { in: [PACIENTE.id] } });
    });

    it('detalheNoEscopo, update e remove: paciente não vinculado dá 403', async () => {
      const { service, delegate } = setup([PACIENTE], [OUTRO]);
      await expect(service.detalheNoEscopo(PACIENTE.id)).rejects.toMatchObject({ status: 403 });
      await expect(service.remove(PACIENTE.id)).rejects.toMatchObject({ status: 403 });
      await expect(service.update(PACIENTE.id, { nome: 'X' } as never)).rejects.toMatchObject({
        status: 403,
      });
      expect(delegate.update).not.toHaveBeenCalled();
    });

    it('detalheNoEscopo: paciente vinculado é devolvido', async () => {
      const agora = new Date();
      const { service } = setup(
        [{ ...PACIENTE, createdAt: agora, updatedAt: agora, origemCliente: null } as never],
        [PACIENTE.id],
      );
      await expect(service.detalheNoEscopo(PACIENTE.id)).resolves.toMatchObject({
        id: PACIENTE.id,
      });
    });
  });
});
