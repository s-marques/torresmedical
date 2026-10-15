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
});
