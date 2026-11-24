import {
  CONSENTIMENTO_CANAIS,
  CONSENTIMENTO_TIPOS,
  type ConsentimentoCanal,
  type ConsentimentoTipo,
} from '@torres/shared';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { EscolhaConsentimento, EscolhasConsentimento } from './escolhas-consentimento';

export interface ConsentimentosNovoPacienteProps {
  valor: EscolhasConsentimento;
  onChange: (valor: EscolhasConsentimento) => void;
  /** Mostra o que falta escolher (depois de tentar cadastrar). */
  mostrarErros: boolean;
}

/**
 * Consentimentos do cadastro novo (issue #148): o aceite explícito de cada tipo e onde foi dado.
 * Cada escolha vira um registro com data e usuário. Em paciente já cadastrado, os consentimentos
 * ficam no detalhe, para preservar o histórico.
 */
export function ConsentimentosNovoPaciente({
  valor,
  onChange,
  mostrarErros,
}: Readonly<ConsentimentosNovoPacienteProps>) {
  const { t } = useTranslation();
  const idCanal = useId();
  return (
    <fieldset className="grid gap-4 border-t pt-4 sm:col-span-2">
      <legend className="pr-2 text-sm font-semibold">
        {t('pacientes.consentimentos.cadastro.titulo')}
      </legend>
      <p className="text-xs text-muted-foreground">
        {t('pacientes.consentimentos.cadastro.descricao')}
      </p>
      {CONSENTIMENTO_TIPOS.map((tipo) => (
        <LinhaConsentimento
          key={tipo}
          tipo={tipo}
          escolha={valor.tipos[tipo]}
          erro={mostrarErros && !valor.tipos[tipo]}
          onChange={(escolha) => onChange({ ...valor, tipos: { ...valor.tipos, [tipo]: escolha } })}
        />
      ))}
      <div className="grid gap-2">
        <label htmlFor={idCanal} className="text-sm leading-none font-medium">
          {t('pacientes.consentimentos.cadastro.canal')}
        </label>
        <select
          id={idCanal}
          value={valor.canal}
          onChange={(e) => onChange({ ...valor, canal: e.target.value as ConsentimentoCanal | '' })}
          aria-invalid={mostrarErros && !valor.canal}
          className="h-9 rounded-md border bg-transparent px-3 text-sm"
        >
          <option value="">{t('comum.selecione')}</option>
          {CONSENTIMENTO_CANAIS.map((canal) => (
            <option key={canal} value={canal}>
              {t(`pacientes.consentimentos.canais.${canal}`)}
            </option>
          ))}
        </select>
        {mostrarErros && !valor.canal && (
          <p role="alert" className="text-xs text-destructive">
            {t('pacientes.consentimentos.cadastro.canalObrigatorio')}
          </p>
        )}
      </div>
    </fieldset>
  );
}

function LinhaConsentimento({
  tipo,
  escolha,
  erro,
  onChange,
}: Readonly<{
  tipo: ConsentimentoTipo;
  escolha: EscolhaConsentimento;
  erro: boolean;
  onChange: (escolha: EscolhaConsentimento) => void;
}>) {
  const { t } = useTranslation();
  const idRotulo = useId();
  const opcoes = [
    { valor: 'ACEITO', rotulo: t('pacientes.consentimentos.situacao.aceito') },
    { valor: 'RECUSADO', rotulo: t('pacientes.consentimentos.situacao.recusado') },
  ] as const;
  return (
    <div className="grid gap-2">
      <div className="grid gap-0.5">
        <span id={idRotulo} className="text-sm font-medium">
          {t(`pacientes.consentimentos.tipos.${tipo}`)}
        </span>
        <span className="text-xs text-muted-foreground">
          {t(`pacientes.consentimentos.dicaTipo.${tipo}`)}
        </span>
      </div>
      <div role="radiogroup" aria-labelledby={idRotulo} className="grid grid-cols-2 gap-2">
        {opcoes.map((opcao) => (
          <button
            key={opcao.valor}
            type="button"
            role="radio"
            aria-checked={escolha === opcao.valor}
            onClick={() => onChange(opcao.valor)}
            className={cn(
              'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
              escolha === opcao.valor
                ? 'border-primary bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent',
            )}
          >
            {opcao.rotulo}
          </button>
        ))}
      </div>
      {erro && (
        <p role="alert" className="text-xs text-destructive">
          {t('pacientes.consentimentos.cadastro.obrigatorio')}
        </p>
      )}
    </div>
  );
}
