import {
  CONSENTIMENTO_TIPOS,
  type ConsentimentoCanal,
  type ConsentimentoInput,
  type ConsentimentoTipo,
} from '@torres/shared';

export type EscolhaConsentimento = 'ACEITO' | 'RECUSADO' | '';

/** O que o usuário marcou no cadastro novo: uma escolha por tipo e onde o paciente consentiu. */
export interface EscolhasConsentimento {
  tipos: Record<ConsentimentoTipo, EscolhaConsentimento>;
  canal: ConsentimentoCanal | '';
}

export const ESCOLHAS_VAZIAS: EscolhasConsentimento = {
  tipos: { TRATAMENTO_DADOS: '', COMUNICACAO: '', CAMPANHAS: '' },
  canal: '',
};

/** Os registros a enviar, ou `null` enquanto faltar alguma escolha ou o canal. */
export function montarConsentimentos(escolhas: EscolhasConsentimento): ConsentimentoInput[] | null {
  if (!escolhas.canal) return null;
  const canal = escolhas.canal;
  const registros: ConsentimentoInput[] = [];
  for (const tipo of CONSENTIMENTO_TIPOS) {
    const escolha = escolhas.tipos[tipo];
    if (!escolha) return null;
    registros.push({ tipo, aceito: escolha === 'ACEITO', canal, observacao: null });
  }
  return registros;
}
