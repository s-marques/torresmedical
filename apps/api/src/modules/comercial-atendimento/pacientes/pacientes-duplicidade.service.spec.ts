import type { TransactionHost } from '@nestjs-cls/transactional';
import { dadosSensiveisFalso } from '../../../../test/utils/dados-sensiveis-falso';
import type { AuditService } from '../../../common/audit/audit.service';
import type { PrismaAdapter } from '../../../common/prisma/prisma-transaction';
import type { PacientesVinculadosService } from '../../consultorio-assistencial/pacientes-vinculados/pacientes-vinculados.service';
import {
  ENTIDADE_DUPLICIDADE,
  normalizarNome,
  PacientesDuplicidadeService,
} from './pacientes-duplicidade.service';

const ID_A = '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ID_B = '1b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

function linha(extra: Record<string, unknown> = {}) {
  return {
    id: ID_A,
    nome: 'Maria da Silva',
    documento: '52998224725',
    dataNascimento: new Date('1990-05-17T00:00:00.000Z'),
    telefone: null,
    celular: '65999990001',
    email: 'maria@exemplo.test',
    ...extra,
  };
}

function setup(
  opcoes: { linhas?: unknown[]; atual?: unknown; ids?: string[] | null; sensiveis?: boolean } = {},
) {
  const paciente = {
    findMany: jest.fn().mockResolvedValue(opcoes.linhas ?? []),
    findFirst: jest.fn().mockResolvedValue(opcoes.atual ?? null),
  };
  const txHost = { tx: { paciente } } as unknown as TransactionHost<PrismaAdapter>;
  const vinculados = { idsNoEscopo: jest.fn().mockResolvedValue(opcoes.ids ?? null) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new PacientesDuplicidadeService(
    txHost,
    vinculados as unknown as PacientesVinculadosService,
    dadosSensiveisFalso(opcoes.sensiveis ?? false),
    audit as unknown as AuditService,
  );
  return { service, paciente, vinculados, audit };
}

describe('normalizarNome', () => {
  it('ignora caixa, acento e espaços repetidos', () => {
    expect(normalizarNome('  JOSÉ   da  Conceição ')).toBe('jose da conceicao');
    expect(normalizarNome(null)).toBe('');
  });
});

describe('PacientesDuplicidadeService', () => {
  describe('verificar', () => {
    it('sem dados que identifiquem, nem consulta o banco', async () => {
      const { service, paciente } = setup();

      await expect(service.verificar({ nome: 'Maria' } as never)).resolves.toEqual({
        candidatos: [],
      });
      expect(paciente.findMany).not.toHaveBeenCalled();
    });

    it('telefone: compara só os dígitos, nos dois campos de telefone', async () => {
      const { service, paciente } = setup({ linhas: [linha()] });

      const res = await service.verificar({ telefone: '(65) 99999-0001' } as never);

      expect(paciente.findMany.mock.calls[0][0].where.AND[0].OR).toEqual([
        { telefone: { in: ['65999990001'] } },
        { celular: { in: ['65999990001'] } },
      ]);
      expect(res.candidatos).toEqual([
        {
          id: ID_A,
          nome: 'Maria da Silva',
          cpfMascarado: null,
          dataNascimento: '1990-05-17',
          motivos: ['TELEFONE'],
        },
      ]);
    });

    it('e-mail: sem diferenciar maiúsculas', async () => {
      const { service, paciente } = setup({ linhas: [linha({ email: 'Maria@Exemplo.test' })] });

      const res = await service.verificar({ email: ' MARIA@exemplo.TEST ' } as never);

      expect(paciente.findMany.mock.calls[0][0].where.AND[0].OR).toEqual([
        { email: { equals: 'maria@exemplo.test', mode: 'insensitive' } },
      ]);
      expect(res.candidatos[0]?.motivos).toEqual(['EMAIL']);
    });

    it('nome + nascimento: ignora acento e caixa; mesmo dia com outro nome não casa', async () => {
      const { service } = setup({
        linhas: [
          linha({ nome: 'MARÍA DA SILVA' }),
          linha({ id: ID_B, nome: 'Joana Souza', celular: null, email: null }),
        ],
      });

      const res = await service.verificar({
        nome: 'Maria da Silva',
        dataNascimento: '1990-05-17',
      } as never);

      expect(res.candidatos.map((c) => [c.id, c.motivos])).toEqual([[ID_A, ['NOME_NASCIMENTO']]]);
    });

    it('só o nome, sem nascimento, não é critério', async () => {
      const { service, paciente } = setup();

      await service.verificar({ nome: 'Maria da Silva' } as never);

      expect(paciente.findMany).not.toHaveBeenCalled();
    });

    it('junta os motivos de um mesmo cadastro', async () => {
      const { service } = setup({ linhas: [linha()] });

      const res = await service.verificar({
        nome: 'maria da silva',
        dataNascimento: '1990-05-17',
        celular: '65999990001',
        email: 'maria@exemplo.test',
      } as never);

      expect(res.candidatos[0]?.motivos).toEqual(['TELEFONE', 'EMAIL', 'NOME_NASCIMENTO']);
    });

    it('CPF mascarado só para quem tem verDadosSensiveis', async () => {
      const com = setup({ linhas: [linha()], sensiveis: true });
      const sem = setup({ linhas: [linha()], sensiveis: false });

      const comResposta = await com.service.verificar({ celular: '65999990001' } as never);
      const semResposta = await sem.service.verificar({ celular: '65999990001' } as never);

      expect(comResposta.candidatos[0]?.cpfMascarado).toBe('***.982.247-**');
      expect(semResposta.candidatos[0]?.cpfMascarado).toBeNull();
      expect(JSON.stringify(semResposta)).not.toContain('982');
    });

    it('escopo restrito: só procura entre os pacientes vinculados', async () => {
      const { service, paciente } = setup({ ids: [ID_B] });

      await service.verificar({ celular: '65999990001' } as never);

      expect(paciente.findMany.mock.calls[0][0].where.AND).toContainEqual({ id: { in: [ID_B] } });
    });

    it('sem restrição de escopo não filtra por id', async () => {
      const { service, paciente } = setup({ ids: null });

      await service.verificar({ celular: '65999990001' } as never);

      expect(paciente.findMany.mock.calls[0][0].where.AND).toHaveLength(1);
    });

    it('limita a lista de candidatos', async () => {
      const linhas = Array.from({ length: 30 }, (_, i) =>
        linha({ id: `0b9c1f7e-1a2b-4c3d-8e9f-${String(i).padStart(12, '0')}` }),
      );
      const { service } = setup({ linhas });

      const res = await service.verificar({ celular: '65999990001' } as never);

      expect(res.candidatos).toHaveLength(20);
    });
  });

  describe('edição (pacienteId)', () => {
    const atual = {
      nome: 'Maria da Silva',
      email: 'maria@exemplo.test',
      telefone: null,
      celular: '65999990001',
      dataNascimento: new Date('1990-05-17T00:00:00.000Z'),
    };

    it('exclui o próprio paciente e ignora o que não mudou', async () => {
      const { service, paciente } = setup({ atual, linhas: [linha()] });

      const res = await service.verificar({
        pacienteId: ID_B,
        nome: 'Maria da Silva',
        email: 'maria@exemplo.test',
        celular: '(65) 99999-0001',
        dataNascimento: '1990-05-17',
      } as never);

      expect(res.candidatos).toEqual([]);
      expect(paciente.findMany).not.toHaveBeenCalled();
    });

    it('só considera os critérios que mudaram e deixa o próprio registro de fora', async () => {
      const { service, paciente } = setup({ atual, linhas: [linha()] });

      await service.verificar({
        pacienteId: ID_B,
        nome: 'Maria da Silva',
        email: 'novo@exemplo.test',
        celular: '65999990001',
        dataNascimento: '1990-05-17',
      } as never);

      const where = paciente.findMany.mock.calls[0][0].where;
      expect(where.AND[0].OR).toEqual([
        { email: { equals: 'novo@exemplo.test', mode: 'insensitive' } },
      ]);
      expect(where.AND).toContainEqual({ id: { not: ID_B } });
    });

    it('mudar o nome ou o nascimento reativa o critério nome + nascimento', async () => {
      const { service, paciente } = setup({ atual });

      await service.verificar({
        pacienteId: ID_B,
        nome: 'Maria Souza',
        dataNascimento: '1990-05-17',
      } as never);

      expect(paciente.findMany.mock.calls[0][0].where.AND[0].OR).toEqual([
        { dataNascimento: new Date('1990-05-17T00:00:00.000Z') },
      ]);
    });
  });

  describe('exigirConfirmacao', () => {
    it('sem duplicado: segue sem confirmação', async () => {
      const { service } = setup();
      await expect(
        service.exigirConfirmacao({ celular: '65999990001' }, undefined),
      ).resolves.toEqual([]);
    });

    it('com duplicado e sem confirmação: 409 PACIENTE_POSSIVEL_DUPLICADO', async () => {
      const { service } = setup({ linhas: [linha()] });

      await expect(
        service.exigirConfirmacao({ celular: '65999990001' }, false),
      ).rejects.toMatchObject({ status: 409, code: 'PACIENTE_POSSIVEL_DUPLICADO' });
    });

    it('com duplicado e confirmado: devolve os candidatos', async () => {
      const { service } = setup({ linhas: [linha()] });

      const candidatos = await service.exigirConfirmacao({ celular: '65999990001' }, true);

      expect(candidatos.map((c) => c.id)).toEqual([ID_A]);
    });
  });

  describe('registrarConfirmacao', () => {
    it('audita quem confirmou e os ids dos possíveis duplicados, sem dados pessoais', async () => {
      const { service, audit } = setup();

      await service.registrarConfirmacao(ID_B, [
        {
          id: ID_A,
          nome: 'Maria da Silva',
          cpfMascarado: '***',
          dataNascimento: null,
          motivos: ['EMAIL'],
        },
      ]);

      expect(audit.record).toHaveBeenCalledWith({
        action: 'CREATE',
        entity: ENTIDADE_DUPLICIDADE,
        entityId: ID_B,
        after: {
          duplicidadeConfirmada: true,
          possiveisDuplicados: [{ id: ID_A, motivos: ['EMAIL'] }],
        },
      });
    });

    it('sem candidatos não grava nada', async () => {
      const { service, audit } = setup();
      await service.registrarConfirmacao(ID_B, []);
      expect(audit.record).not.toHaveBeenCalled();
    });
  });
});
