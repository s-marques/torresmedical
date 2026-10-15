import type { ComponentProps, ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface CampoAuthProps extends ComponentProps<typeof Input> {
  id: string;
  rotulo: string;
  erro?: string;
  /** Conteúdo ao lado do rótulo (ex.: "Esqueci minha senha"). */
  extra?: ReactNode;
}

/** Campo com rótulo e mensagem de erro das telas de autenticação. */
export function CampoAuth({ id, rotulo, erro, extra, ...input }: Readonly<CampoAuthProps>) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{rotulo}</Label>
        {extra}
      </div>
      <Input
        id={id}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-erro` : undefined}
        {...input}
      />
      {erro && (
        <p id={`${id}-erro`} className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}
