import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/shared/PageHeader';
import { hojeISO } from '@/lib/datas';
import { DetalheAtendimento } from './DetalheAtendimento';
import { ListaDoDia } from './ListaDoDia';

const DATA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Tela Atendimento Médico (`/atendimento-medico`,
 * docs/inventario/telas/consultorio-assistencial-atendimento-medico.md). O dia (`?data=`) e o
 * agendamento aberto (`?agendamento=`) ficam na URL, junto com os filtros do grid: o "Voltar"
 * do detalhe devolve a lista como estava.
 */
export default function AtendimentoMedicoPage() {
  const [params, setParams] = useSearchParams();
  const agendamentoId = params.get('agendamento');
  const dataUrl = params.get('data');
  const data = dataUrl && DATA_VALIDA.test(dataUrl) ? dataUrl : hojeISO();

  const alterar = useCallback(
    (chave: string, valor: string | null) =>
      setParams(
        (atuais) => {
          const proximos = new URLSearchParams(atuais);
          if (valor) proximos.set(chave, valor);
          else proximos.delete(chave);
          return proximos;
        },
        { replace: chave === 'data' },
      ),
    [setParams],
  );
  const abrir = useCallback((id: string) => alterar('agendamento', id), [alterar]);
  const mudarData = useCallback((nova: string) => alterar('data', nova), [alterar]);

  if (agendamentoId) {
    return (
      <DetalheAtendimento
        key={agendamentoId}
        agendamentoId={agendamentoId}
        onVoltar={() => alterar('agendamento', null)}
      />
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Atendimento Médico"
        descricao="Gerencie os atendimentos do dia. Clique em um agendamento para iniciar."
      />
      <ListaDoDia data={data} onData={mudarData} onAbrir={abrir} />
    </div>
  );
}
