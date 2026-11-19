import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/shared/PageHeader';
import { ListaAgendamentosHoje } from './ListaAgendamentosHoje';
import { SessaoGravacao } from './SessaoGravacao';

/**
 * Tela Evolução por Voz (`/evolucoes`,
 * docs/inventario/telas/consultorio-assistencial-evolucao-por-voz.md). O agendamento aberto
 * fica na URL (`?agendamento=`); "Trocar paciente" volta para a lista do dia.
 */
export default function EvolucaoVozPage() {
  const [params, setParams] = useSearchParams();
  const agendamentoId = params.get('agendamento');

  const abrir = useCallback(
    (id: string | null) =>
      setParams((atuais) => {
        const proximos = new URLSearchParams(atuais);
        if (id) proximos.set('agendamento', id);
        else proximos.delete('agendamento');
        return proximos;
      }),
    [setParams],
  );

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Evolução por Voz"
        descricao="Grave a consulta, transcreva em tempo real e gere resumo com IA."
      />
      {agendamentoId ? (
        <SessaoGravacao
          key={agendamentoId}
          agendamentoId={agendamentoId}
          onTrocarPaciente={() => abrir(null)}
        />
      ) : (
        <ListaAgendamentosHoje onAbrir={abrir} />
      )}
    </div>
  );
}
