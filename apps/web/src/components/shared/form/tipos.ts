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
 * - texto, email, senha, textarea, data (`AAAA-MM-DD`) e select: `string` (`''` quando vazio);
 * - máscaras (cpf, cnpj, cpf-cnpj, telefone, cep): só os dígitos;
 * - numero e moeda: `number` (`null` quando vazio);
 * - checkbox e switch: `boolean`;
 * - entidade: id (`null` quando vazio).
 */
export type TipoCampoSimples =
  | 'texto'
  | 'email'
  | 'senha'
  | 'numero'
  | 'moeda'
  | 'data'
  | 'textarea'
  | 'checkbox'
  | 'switch'
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
