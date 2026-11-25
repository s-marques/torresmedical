import type { ModeloProntuario } from '@torres/shared';
import { useId } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CamposDoModelo } from './CamposDoModelo';
import { respostasIniciais } from './respostas-modelo';

/** O Select do Radix não aceita item vazio: "sem modelo" usa este valor e vira `''` no form. */
const SEM_MODELO = 'sem-modelo';

export interface SecaoModeloAtendimentoProps {
  /** Modelos usáveis pelo profissional escolhido (os padrão e os dele); `null` sem profissional. */
  modelos: readonly ModeloProntuario[] | null;
  /** Modelo escolhido, ou `null` (sem modelo, ou o profissional mudou e o modelo saiu da lista). */
  modelo: ModeloProntuario | null;
}

/**
 * Escolha do modelo de prontuário e os campos dele, dentro do formulário do novo atendimento
 * (issue #152). Trocar o modelo zera as respostas, que são do modelo anterior.
 */
export function SecaoModeloAtendimento({ modelos, modelo }: Readonly<SecaoModeloAtendimentoProps>) {
  const { t } = useTranslation();
  const { setValue } = useFormContext();
  const id = useId();

  function escolher(valor: string) {
    const escolhido = modelos?.find((m) => m.id === valor) ?? null;
    setValue('modeloId', escolhido?.id ?? '');
    setValue('respostas', escolhido ? respostasIniciais(escolhido.secoes, null) : {});
  }

  return (
    <>
      <div className="col-span-full grid gap-2">
        <Label htmlFor={id}>{t('modelosProntuario.atendimento.modelo')}</Label>
        <Select
          value={modelo?.id ?? SEM_MODELO}
          onValueChange={escolher}
          disabled={modelos === null}
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_MODELO}>
              {t('modelosProntuario.atendimento.semModelo')}
            </SelectItem>
            {(modelos ?? []).map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.especialidade ? `${m.nome} (${m.especialidade})` : m.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {modelos === null && (
          <p className="text-sm text-muted-foreground">
            {t('modelosProntuario.atendimento.escolhaProfissional')}
          </p>
        )}
      </div>
      {modelo && <CamposDoModelo secoes={modelo.secoes} />}
    </>
  );
}
