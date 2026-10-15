import { Loader2Icon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useFocoDeRetorno } from './use-foco-de-retorno';

export interface ConfirmDialogProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Ex.: "Excluir unidade?". */
  titulo: string;
  /** Ex.: "Esta ação não pode ser desfeita." */
  descricao?: ReactNode;
  /** Ex.: "Excluir". Padrão: "Confirmar". */
  rotuloConfirmar?: string;
  rotuloCancelar?: string;
  /** Botão de confirmação em vermelho. Padrão: `true` (o uso principal é ação destrutiva). */
  destrutivo?: boolean;
  /**
   * Executa a ação. Se devolver uma Promise, o botão mostra carregamento e o diálogo só fecha
   * quando ela resolve; se rejeitar, o diálogo continua aberto (o erro aparece pelo tratamento
   * global da API, quando vier de uma mutation).
   */
  onConfirmar: () => unknown;
}

/** Confirmação obrigatória das ações destrutivas: excluir, cancelar, desativar (CLAUDE.md, seção 3). */
export function ConfirmDialog({
  aberto,
  onAbertoChange,
  titulo,
  descricao,
  rotuloConfirmar = 'Confirmar',
  rotuloCancelar = 'Cancelar',
  destrutivo = true,
  onConfirmar,
}: Readonly<ConfirmDialogProps>) {
  const [executando, setExecutando] = useState(false);
  const foco = useFocoDeRetorno();

  async function confirmar(evento: { preventDefault: () => void }) {
    // O Radix fecharia o diálogo no clique; ele só fecha quando a ação termina.
    evento.preventDefault();
    if (executando) return;
    setExecutando(true);
    try {
      await onConfirmar();
      onAbertoChange(false);
    } catch {
      // Mantém aberto para tentar de novo.
    } finally {
      setExecutando(false);
    }
  }

  return (
    <AlertDialog open={aberto} onOpenChange={(novo) => executando || onAbertoChange(novo)}>
      <AlertDialogContent {...foco} {...(descricao ? {} : { 'aria-describedby': undefined })}>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          {descricao && <AlertDialogDescription>{descricao}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          {/* `aria-disabled` em vez de `disabled`: o botão desabilitado perderia o foco do teclado. */}
          <AlertDialogCancel aria-disabled={executando} className={cn(executando && 'opacity-50')}>
            {rotuloCancelar}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={destrutivo ? 'destructive' : 'default'}
            aria-disabled={executando}
            aria-busy={executando}
            className={cn(executando && 'opacity-50')}
            onClick={confirmar}
          >
            {executando && <Loader2Icon aria-hidden className="animate-spin" />}
            {rotuloConfirmar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
