import { CONSULTA_LOOKUP, txHostFalso } from '../../../../test/utils/tx-host-falso';
import { TiposAgendamentoService } from './tipos-agendamento.service';

const TIPO = { id: '0b9c1f7e-1a2b-4c3d-8e9f-0a1b2c3d4e5f', nome: 'Retorno', duracaoMinutos: 20 };

describe('TiposAgendamentoService', () => {
  it('lookup: ativos com a duração na descrição', async () => {
    const { txHost, delegate } = txHostFalso('tipoAgendamento', [TIPO]);

    const page = await new TiposAgendamentoService(txHost).lookup(CONSULTA_LOOKUP);

    expect(delegate.count).toHaveBeenCalledWith({ where: { deletedAt: null, ativo: true } });
    expect(page.data).toEqual([{ id: TIPO.id, label: 'Retorno', descricao: '20 min' }]);
  });

  it('404 quando não existe', async () => {
    const { txHost } = txHostFalso('tipoAgendamento', []);

    await expect(new TiposAgendamentoService(txHost).findById(TIPO.id)).rejects.toMatchObject({
      message: 'Tipo de agendamento não encontrado',
    });
  });

  describe('escrita e listagem', () => {
    const ENTRADA = {
      nome: 'Avaliação',
      duracaoMinutos: 30,
      cor: '#3b82f6',
      permiteProcedimento: true,
      permitePacote: false,
      soroterapia: false,
    };

    it('list: sem excluídos, filtra status e busca por nome', async () => {
      const { txHost, delegate } = txHostFalso('tipoAgendamento', [TIPO]);

      const page = await new TiposAgendamentoService(txHost).list({
        page: 1,
        pageSize: 100,
        sort: { field: 'nome', direction: 'asc' },
        status: 'inativo',
        search: 'ret',
      });

      expect(delegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null, ativo: false }),
          orderBy: [{ nome: 'asc' }, { id: 'asc' }],
        }),
      );
      expect(page.meta.total).toBe(1);
    });

    it('create grava os campos informados', async () => {
      const { txHost, delegate } = txHostFalso('tipoAgendamento', [TIPO]);

      await new TiposAgendamentoService(txHost).create(ENTRADA);

      expect(delegate.create).toHaveBeenCalledWith({ data: ENTRADA });
    });

    it('update altera só o informado e 404 se não existe', async () => {
      const { txHost, delegate } = txHostFalso('tipoAgendamento', [TIPO]);
      const service = new TiposAgendamentoService(txHost);

      await service.update(TIPO.id, { soroterapia: true });
      expect(delegate.update).toHaveBeenCalledWith({
        where: { id: TIPO.id },
        data: { soroterapia: true },
      });

      const vazio = txHostFalso('tipoAgendamento', []);
      await expect(
        new TiposAgendamentoService(vazio.txHost).update(TIPO.id, { soroterapia: true }),
      ).rejects.toMatchObject({ message: 'Tipo de agendamento não encontrado' });
      expect(vazio.delegate.update).not.toHaveBeenCalled();
    });

    it('remove faz exclusão lógica', async () => {
      const { txHost, delegate } = txHostFalso('tipoAgendamento', [TIPO]);

      await new TiposAgendamentoService(txHost).remove(TIPO.id);

      expect(delegate.update).toHaveBeenCalledWith({
        where: { id: TIPO.id },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });
});
