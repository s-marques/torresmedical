import type { AgenteInstrucao, AgenteInstrucaoVersao } from '@torres/shared';
import { HistoryIcon } from 'lucide-react';
import { useState } from 'react';
import { Modal } from '@/components/shared/Modal';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SePermitido } from '@/components/shared/SePermitido';
import { cn } from '@/lib/utils';
import { diffLinhas } from './diff-linhas';
import { useRestaurarVersao, useVersoesInstrucao } from './use-instrucoes-agente';

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const MARCA = { igual: '  ', removida: '- ', adicionada: '+ ' } as const;
const COR = {
  igual: '',
  removida: 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200',
  adicionada: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
} as const;

function rotuloVersao(versao: AgenteInstrucaoVersao): string {
  return `Versão ${versao.numero}`;
}

/**
 * Histórico de versões de uma instrução (IA p. 4): compara cada versão com a anterior (diff por
 * linha do System Prompt) e permite voltar a ela, o que gera uma versão nova em rascunho.
 */
export function ModalVersoes({
  instrucao,
  onFechar,
}: Readonly<{ instrucao: AgenteInstrucao; onFechar: () => void }>) {
  const versoes = useVersoesInstrucao(instrucao.id);
  const restaurar = useRestaurarVersao();
  const [escolhida, setEscolhida] = useState<number | null>(null);
  const lista = versoes.data ?? [];
  const atual = lista.find((v) => v.numero === (escolhida ?? lista[0]?.numero));
  const anterior = lista.find((v) => v.numero === (atual?.numero ?? 0) - 1);

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={`Histórico de versões: ${instrucao.nome}`}
      tamanho="xl"
    >
      {versoes.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
          <ul aria-label="Versões" className="grid content-start gap-1">
            {lista.map((versao) => (
              <li key={versao.id}>
                <button
                  type="button"
                  aria-pressed={atual?.numero === versao.numero}
                  onClick={() => setEscolhida(versao.numero)}
                  className={cn(
                    'w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted',
                    atual?.numero === versao.numero && 'border-primary bg-muted',
                  )}
                >
                  <span className="flex items-center gap-1 font-medium">
                    <HistoryIcon aria-hidden className="size-3.5" />
                    {rotuloVersao(versao)}
                    {versao.numero === instrucao.versaoAtual && ' (atual)'}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {DATA_HORA.format(new Date(versao.createdAt))}
                    {versao.criadoPorNome ? ` · ${versao.criadoPorNome}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {atual && (
            <section aria-label={`Diferenças da ${rotuloVersao(atual)}`} className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">
                  {anterior
                    ? `${rotuloVersao(atual)} comparada à versão ${anterior.numero}`
                    : `${rotuloVersao(atual)} (primeira versão)`}
                </h3>
                {atual.numero !== instrucao.versaoAtual && (
                  <SePermitido permissao="configuracoes-gestao.instrucoes-agente.editar">
                    <Button
                      type="button"
                      size="sm"
                      disabled={restaurar.isPending}
                      onClick={async () => {
                        await restaurar.mutateAsync({ id: instrucao.id, numero: atual.numero });
                        onFechar();
                      }}
                    >
                      Restaurar esta versão
                    </Button>
                  </SePermitido>
                )}
              </div>
              <pre className="max-h-96 overflow-auto rounded-md border p-2 text-xs whitespace-pre-wrap">
                {diffLinhas(anterior?.systemPrompt ?? '', atual.systemPrompt)
                  .filter((l) => anterior || l.tipo !== 'removida')
                  .map((linha, i) => (
                    <span key={i} className={cn('block', COR[linha.tipo])}>
                      {anterior ? MARCA[linha.tipo] : ''}
                      {linha.texto}
                    </span>
                  ))}
              </pre>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
