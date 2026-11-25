import type { ModeloCampoFormulario } from '@torres/shared';

/** Campo novo: a chave é gerada e fica estável (as respostas dos atendimentos usam a chave). */
export function campoVazio(): ModeloCampoFormulario {
  return {
    chave: `campo_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`,
    rotulo: '',
    tipo: 'TEXTO',
    obrigatorio: false,
    opcoes: null,
    min: null,
    max: null,
  };
}

export function secaoVazia() {
  return { titulo: '', campos: [campoVazio()] };
}
