import type { AuditAction, Paciente } from '@torres/shared';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/ui/button';
import { camposAlterados } from './formatadores';
import { useHistoricoPaciente } from './use-pacientes';

const ACOES: Record<AuditAction, string> = {
  CREATE: 'Cadastro',
  UPDATE: 'Alteração',
  DELETE: 'Exclusão',
  EXPORT: 'Exportação',
};

export interface HistoricoPacienteProps {
  paciente: Paciente;
  onFechar: () => void;
}

/** Modal "Histórico": quem alterou o cadastro, quando e quais campos (a partir do audit_log). */
export function HistoricoPaciente({ paciente, onFechar }: Readonly<HistoricoPacienteProps>) {
  const historico = useHistoricoPaciente(paciente.id);
  const itens = historico.data?.data ?? [];
  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={`Histórico de ${paciente.nome}`}
      tamanho="lg"
      rodape={
        <Button type="button" variant="outline" onClick={onFechar}>
          Fechar
        </Button>
      }
    >
      {historico.isPending && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {historico.isError && (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar o histórico.
        </p>
      )}
      {historico.isSuccess && itens.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma alteração registrada.</p>
      )}
      <ol className="grid gap-3">
        {itens.map((item) => {
          const campos = item.action === 'UPDATE' ? camposAlterados(item) : [];
          return (
            <li key={item.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{ACOES[item.action]}</strong>
                <time dateTime={item.occurredAt} className="text-muted-foreground">
                  {new Date(item.occurredAt).toLocaleString('pt-BR')}
                </time>
              </div>
              {campos.length > 0 && (
                <p className="mt-1 text-muted-foreground">Campos: {campos.join(', ')}</p>
              )}
            </li>
          );
        })}
      </ol>
    </Modal>
  );
}
