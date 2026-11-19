import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface Opcao<T extends string> {
  valor: T;
  rotulo: string;
  icone: ReactNode;
}

export interface GrupoOpcoesProps<T extends string> {
  titulo: string;
  opcoes: readonly Opcao<T>[];
  valor: T;
  onChange: (valor: T) => void;
  disabled?: boolean;
}

/** Cartões de escolha única da aba Aparência (Tema, Esquema de Cores, Densidade, Idioma). */
export function GrupoOpcoes<T extends string>({
  titulo,
  opcoes,
  valor,
  onChange,
  disabled,
}: Readonly<GrupoOpcoesProps<T>>) {
  return (
    <fieldset className="grid gap-3 border-b pb-6 last:border-b-0 last:pb-0">
      <legend className="mb-3 text-sm font-medium">{titulo}</legend>
      <div role="radiogroup" aria-label={titulo} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {opcoes.map((opcao) => {
          const selecionada = opcao.valor === valor;
          return (
            <button
              key={opcao.valor}
              type="button"
              role="radio"
              aria-checked={selecionada}
              disabled={disabled}
              onClick={() => {
                if (!selecionada) onChange(opcao.valor);
              }}
              className={cn(
                'flex flex-col items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60',
                selecionada && 'border-2 border-primary bg-primary/5 font-medium text-primary',
              )}
            >
              {opcao.icone}
              {opcao.rotulo}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
