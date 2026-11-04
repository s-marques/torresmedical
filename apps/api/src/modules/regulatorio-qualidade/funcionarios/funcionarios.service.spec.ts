import type { ExportService } from '../../../common/export/export.service';
import { CONSULTA_LOOKUP, txHostFalso } from '../../../../test/utils/tx-host-falso';
import { FuncionariosService } from './funcionarios.service';

const FUNCIONARIO = {
  id: '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f',
  nome: 'João Teste',
  cargo: { nome: 'Recepção', departamento: 'Atendimento' },
};
const EXPORT_SERVICE = {} as ExportService;
const INCLUDE_CARGO = { cargo: { select: { nome: true, departamento: true } } };

describe('FuncionariosService', () => {
  it('lookup: ativos com o cargo na descrição', async () => {
    const { txHost, delegate } = txHostFalso('funcionario', [FUNCIONARIO]);

    const page = await new FuncionariosService(txHost, EXPORT_SERVICE).lookup({
      ...CONSULTA_LOOKUP,
      search: 'jo',
    });

    expect(delegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: INCLUDE_CARGO,
        where: {
          deletedAt: null,
          ativo: true,
          OR: [{ nome: { contains: 'jo', mode: 'insensitive' } }],
        },
      }),
    );
    expect(page.data[0]).toEqual({
      id: FUNCIONARIO.id,
      label: 'João Teste',
      descricao: 'Recepção',
    });
  });

  it('sem cargo a descrição é nula; 404 quando não existe', async () => {
    const { txHost, delegate } = txHostFalso('funcionario', [{ ...FUNCIONARIO, cargo: null }]);

    await expect(
      new FuncionariosService(txHost, EXPORT_SERVICE).findLookupById(FUNCIONARIO.id),
    ).resolves.toMatchObject({
      descricao: null,
    });
    expect(delegate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ include: INCLUDE_CARGO }),
    );
    const vazio = txHostFalso('funcionario', []);
    await expect(
      new FuncionariosService(vazio.txHost, EXPORT_SERVICE).findById(FUNCIONARIO.id),
    ).rejects.toMatchObject({
      message: 'Funcionário não encontrado',
    });
  });
});
