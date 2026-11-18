import type { LookupEntidade } from '@torres/shared';
import type { ReactNode } from 'react';
import type { FiltrosLookup } from '@/lib/api/lookups';
import type { TipoMascara } from '@/lib/forms/mascaras';

export interface OpcaoCampo {
  valor: string;
  rotulo: string;
}

/**
 * Valor guardado no formulário por tipo:
 * - texto, email, senha, textarea, data (`AAAA-MM-DD`), hora (`HH:MM`) e select: `string` (`''` quando vazio);
 * - máscaras (cpf, cnpj, cpf-cnpj, telefone, cep): só os dígitos;
 * - numero e moeda: `number` (`null` quando vazio);
 * - cor: `string` hexadecimal `#RRGGBB`, com seletor de cor e campo de texto;
 * - checkbox e switch: `boolean`;
 * - entidade: id (`null` quando vazio);
 * - entidades: lista de ids (`[]` quando vazio).
 */
export type TipoCampoSimples =
  | 'texto'
  | 'email'
  | 'senha'
  | 'numero'
  | 'moeda'
  | 'data'
  | 'hora'
  | 'textarea'
  | 'checkbox'
  | 'switch'
  | 'cor'
  | TipoMascara;

interface CampoBase {
  /** Caminho do campo no formulário (ex.: `nome`, `endereco.cep`). */
  name: string;
  label: string;
  /** Mostra o asterisco e `aria-required`. A regra fica no schema Zod. */
  obrigatorio?: boolean;
  /** Texto de ajuda abaixo do campo. */
  descricao?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export type FormFieldProps = CampoBase &
  (
    | { tipo?: TipoCampoSimples }
    | { tipo: 'select'; opcoes: readonly OpcaoCampo[] }
    | { tipo: 'entidade'; entidade: LookupEntidade; filtros?: FiltrosLookup }
    /** Várias entidades: o valor é `string[]` (ids); `iniciais` traz os rótulos da edição. */
    | {
        tipo: 'entidades';
        entidade: LookupEntidade;
        filtros?: FiltrosLookup;
        iniciais?: readonly { id: string; nome: string }[];
        /** Texto quando nada foi selecionado. */
        vazio?: string;
      }
    /** Período De/Até: `name` é o início e `nameAte` o fim (cada um `AAAA-MM-DD`). */
    | { tipo: 'periodo'; nameAte: string }
  );

/** Atributos de acessibilidade que o `FormField` liga ao controle. */
export interface AriaCampo {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby'?: string;
  'aria-required'?: boolean;
}
