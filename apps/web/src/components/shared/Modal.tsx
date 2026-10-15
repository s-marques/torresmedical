import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useFocoDeRetorno } from './use-foco-de-retorno';

const LARGURAS = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
} as const;

export interface ModalProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  titulo: string;
  descricao?: ReactNode;
  children: ReactNode;
  /** Botões do rodapé. Num formulário, use `<Button type="submit" form="<id do FormLayout>">`. */
  rodape?: ReactNode;
  tamanho?: keyof typeof LARGURAS;
  className?: string;
}

/**
 * Modal de criação, edição e detalhe. Fecha com Esc, clique fora ou no "Fechar", e devolve o
 * foco a quem abriu. Para ações destrutivas, use o `ConfirmDialog`.
 */
export function Modal({
  aberto,
  onAbertoChange,
  titulo,
  descricao,
  children,
  rodape,
  tamanho = 'md',
  className,
}: Readonly<ModalProps>) {
  const foco = useFocoDeRetorno();
  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent
        {...foco}
        className={cn('max-h-[90svh] grid-rows-[auto_1fr_auto]', LARGURAS[tamanho], className)}
        // Sem descrição, o título já nomeia o diálogo (evita o aviso do Radix).
        {...(descricao ? {} : { 'aria-describedby': undefined })}
      >
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {descricao && <DialogDescription>{descricao}</DialogDescription>}
        </DialogHeader>
        <div className="-mx-6 overflow-y-auto px-6">{children}</div>
        {rodape && <DialogFooter>{rodape}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
