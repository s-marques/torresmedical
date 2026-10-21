import { CONSULTA_LOOKUP, txHostFalso } from '../../../../test/utils/tx-host-falso';
import { SegredosService } from '../../../common/crypto/segredos.service';
import type { ExportService } from '../../../common/export/export.service';
import type { ArquivosService } from '../../../common/storage/arquivos.service';
import { ProfissionaisService } from './profissionais.service';

const ESPECIALIDADE_ID = '7a1d3c52-8d0f-4b8e-9f4c-2b2f3c4d5e6f';
const PROFISSIONAL = {
  id: '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  nome: 'Dra. Teste',
  registro: 'CRM 1234',
  especialidade: { nome: 'Pediatria' },
};

const segredos = new SegredosService({ SECRETS_ENCRYPTION_KEY: 'k'.repeat(32) });

function setup(registros: unknown[] = [PROFISSIONAL], arquivo?: { uso: string }) {
  const { txHost, delegate } = txHostFalso('profissional', registros);
  const especialidade = {
    findFirst: jest.fn().mockResolvedValue({ ativo: true }),
  };
  (txHost.tx as unknown as Record<string, unknown>).especialidade = especialidade;
  const exportService = {
    ensureWithinLimit: jest.fn(),
    export: jest.fn().mockResolvedValue({ filename: 'profissionais.xlsx' }),
  };
  const arquivos = {
    findById: jest.fn().mockResolvedValue(arquivo ?? { uso: 'foto-profissional' }),
  };
  return {
    service: new ProfissionaisService(
      txHost,
      exportService as unknown as ExportService,
      segredos,
      arquivos as unknown as ArquivosService,
    ),
    delegate,
    especialidade,
    exportService,
    arquivos,
  };
}

const COMPLETO = {
  ...PROFISSIONAL,
  especialidadeId: ESPECIALIDADE_ID,
  outrasEspecialidades: null,
  telefone: null,
  email: null,
  duracaoPadrao: 30,
  valorConsulta: '150.5',
  comissao: null,
  corCalendario: 'azul',
  cpf: null,
  rg: null,
  dataNascimento: new Date('1990-05-17T00:00:00.000Z'),
  naturalidade: null,
  estadoCivil: null,
  endereco: null,
  enderecoConsultorio: null,
  telefoneReceita: null,
  cnes: null,
  rodapeReceita: null,
  layoutReceita: 'PADRAO',
  memedApiToken: null,
  memedSecretKey: null,
  fotoArquivoId: null,
  logoReceitaArquivoId: null,
  ativo: true,
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
  updatedAt: new Date('2026-10-02T10:00:00.000Z'),
  deletedAt: null,
};

const ENTRADA = {
  nome: 'Dra. Teste',
  especialidadeId: null,
  registro: null,
  outrasEspecialidades: null,
  email: null,
  telefone: null,
  duracaoPadrao: 30,
  valorConsulta: null,
  comissao: null,
  corCalendario: 'azul' as const,
  cpf: null,
  rg: null,
  dataNascimento: null,
  naturalidade: null,
  estadoCivil: null,
  endereco: null,
  enderecoConsultorio: null,
  telefoneReceita: null,
  cnes: null,
  rodapeReceita: null,
  layoutReceita: 'PADRAO' as const,
  memedApiToken: null,
  memedSecretKey: null,
};

describe('ProfissionaisService', () => {
  it('lookup: ativos, filtro por especialidade, busca em nome e registro, com a especialidade', async () => {
    const { service, delegate } = setup();

    const page = await service.lookup({
      ...CONSULTA_LOOKUP,
      search: 'crm',
      especialidadeId: ESPECIALIDADE_ID,
    });

    expect(delegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { especialidade: { select: { nome: true } } },
        where: {
          deletedAt: null,
          ativo: true,
          especialidadeId: ESPECIALIDADE_ID,
          OR: [
            { nome: { contains: 'crm', mode: 'insensitive' } },
            { registro: { contains: 'crm', mode: 'insensitive' } },
          ],
        },
      }),
    );
    expect(page.data[0]).toEqual({
      id: PROFISSIONAL.id,
      label: 'Dra. Teste',
      descricao: 'Pediatria · CRM 1234',
    });
  });

  it('findLookupById inclui a especialidade; sem especialidade e registro a descrição é nula', async () => {
    const { service, delegate } = setup([
      { ...PROFISSIONAL, registro: null, especialidade: null } as never,
    ]);

    await expect(service.findLookupById(PROFISSIONAL.id)).resolves.toMatchObject({
      descricao: null,
    });
    expect(delegate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ include: { especialidade: { select: { nome: true } } } }),
    );
    await expect(setup([]).service.findById(PROFISSIONAL.id)).rejects.toMatchObject({
      message: 'Profissional não encontrado',
    });
  });

  it('contarAtivos: só profissionais ativos e não excluídos', async () => {
    const { service, delegate } = setup();

    await expect(service.contarAtivos()).resolves.toBe(1);

    expect(delegate.count).toHaveBeenCalledWith({ where: { deletedAt: null, ativo: true } });
  });

  describe('tela Profissionais', () => {
    it('list: não excluídos, status e busca, ordenando pela coluna', async () => {
      const { service, delegate } = setup([COMPLETO]);

      const page = await service.list({
        page: 2,
        pageSize: 10,
        sort: { field: 'valorConsulta', direction: 'desc' },
        search: 'dra',
        status: 'inativo',
      });

      expect(delegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
          orderBy: [{ valorConsulta: 'desc' }, { id: 'desc' }],
          include: { especialidade: { select: { nome: true } } },
          where: expect.objectContaining({ deletedAt: null, ativo: false }),
        }),
      );
      expect(page.data[0]).toMatchObject({ valorConsulta: 150.5, dataNascimento: '1990-05-17' });
    });

    it('detalhe: devolve o API Token decifrado e nunca a Secret Key', async () => {
      const { service } = setup([
        {
          ...COMPLETO,
          especialidade: { nome: 'Pediatria' },
          memedApiToken: segredos.cifrar('token-fake'),
          memedSecretKey: segredos.cifrar('segredo-fake'),
        },
      ]);

      const dto = await service.detalhe(PROFISSIONAL.id);

      expect(dto.memedApiToken).toBe('token-fake');
      expect(dto.memedSecretKeyDefinida).toBe(true);
      expect(dto.especialidadeNome).toBe('Pediatria');
      expect(JSON.stringify(dto)).not.toContain('segredo-fake');
      expect(dto).not.toHaveProperty('memedSecretKey');
      expect(dto).not.toHaveProperty('deletedAt');
    });

    it('detalhe: 404 para id inválido, inexistente ou excluído', async () => {
      await expect(setup([]).service.detalhe('abc')).rejects.toMatchObject({ status: 404 });
      await expect(setup([]).service.detalhe(PROFISSIONAL.id)).rejects.toMatchObject({
        message: 'Profissional não encontrado',
      });
    });

    it('create: cifra as credenciais da Memed e grava a data de nascimento em UTC', async () => {
      const { service, delegate } = setup([COMPLETO]);

      await service.create({
        ...ENTRADA,
        dataNascimento: '1990-05-17',
        memedApiToken: 'token-fake',
        memedSecretKey: 'segredo-fake',
      });

      const data = delegate.create.mock.calls[0][0].data;
      expect(data.dataNascimento).toEqual(new Date('1990-05-17T00:00:00.000Z'));
      expect(data.memedApiToken).not.toBe('token-fake');
      expect(segredos.decifrar(data.memedApiToken)).toBe('token-fake');
      expect(segredos.decifrar(data.memedSecretKey)).toBe('segredo-fake');
    });

    it('create: especialidade inexistente ou inativa → 400', async () => {
      const { service, especialidade, delegate } = setup([COMPLETO]);
      especialidade.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.create({ ...ENTRADA, especialidadeId: ESPECIALIDADE_ID }),
      ).rejects.toMatchObject({ code: 'ESPECIALIDADE_INVALIDA', status: 400 });
      expect(delegate.create).not.toHaveBeenCalled();
    });

    it('update: Secret Key em branco mantém a gravada; sem API Token apaga as duas', async () => {
      const gravada = segredos.cifrar('segredo-fake');
      const { service, delegate } = setup([
        { ...COMPLETO, memedApiToken: segredos.cifrar('t'), memedSecretKey: gravada },
      ]);

      await service.update(PROFISSIONAL.id, { ...ENTRADA, memedApiToken: 'novo-token' });
      expect(delegate.update.mock.calls[0][0].data.memedSecretKey).toBe(gravada);

      await service.update(PROFISSIONAL.id, { ...ENTRADA, memedApiToken: null });
      expect(delegate.update.mock.calls[1][0].data).toMatchObject({
        memedApiToken: null,
        memedSecretKey: null,
      });
    });

    it('alterarStatus: Desativar e Ativar', async () => {
      const { service, delegate } = setup([COMPLETO]);

      await service.alterarStatus(PROFISSIONAL.id, false);

      expect(delegate.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: PROFISSIONAL.id }, data: { ativo: false } }),
      );
    });

    it('remove: exclusão lógica', async () => {
      const { service, delegate } = setup([COMPLETO]);

      await service.remove(PROFISSIONAL.id);

      expect(delegate.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
    });

    it('definirArquivo: grava a foto; arquivo de outro uso → 400; null remove', async () => {
      const ok = setup([COMPLETO]);
      await ok.service.definirArquivo(PROFISSIONAL.id, 'foto', ESPECIALIDADE_ID);
      expect(ok.delegate.update.mock.calls[0][0].data).toEqual({ fotoArquivoId: ESPECIALIDADE_ID });

      const errado = setup([COMPLETO], { uso: 'logo-receita' });
      await expect(
        errado.service.definirArquivo(PROFISSIONAL.id, 'foto', ESPECIALIDADE_ID),
      ).rejects.toMatchObject({ code: 'ARQUIVO_USO_INVALIDO', status: 400 });
      expect(errado.delegate.update).not.toHaveBeenCalled();

      const remover = setup([COMPLETO]);
      await remover.service.definirArquivo(PROFISSIONAL.id, 'logo-receita', null);
      expect(remover.delegate.update.mock.calls[0][0].data).toEqual({ logoReceitaArquivoId: null });
      expect(remover.arquivos.findById).not.toHaveBeenCalled();
    });

    it('export: mesmos filtros da listagem, só as colunas pedidas', async () => {
      const { service, exportService, delegate } = setup([COMPLETO]);

      await service.export({
        format: 'xlsx',
        sort: { field: 'nome', direction: 'asc' },
        status: 'ativo',
        search: undefined,
        columns: ['nome', 'valorConsulta'],
      });

      expect(exportService.ensureWithinLimit).toHaveBeenCalledWith(1);
      expect(delegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ ativo: true }) }),
      );
      const pedido = exportService.export.mock.calls[0][0];
      expect(pedido.columns.map((c: { key: string }) => c.key)).toEqual(['nome', 'valorConsulta']);
      expect(pedido.columns[1].value({ valorConsulta: '600' })).toBe(600);
    });
  });
});
