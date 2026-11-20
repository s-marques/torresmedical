import {
  abreviarDiaSemana,
  CONTRATO_HORARIO_PADRAO,
  CONTRATO_LOCATARIO_ROTULOS,
  CONTRATO_LOCATARIO_TIPOS,
  CONTRATO_MODALIDADE_DESCRICOES,
  CONTRATO_MODALIDADE_ROTULOS,
  CONTRATO_MODALIDADES,
  DIAS_SEMANA,
  type ContratoLocatarioTipo,
  type ContratoModalidade,
  type ContratoSalaFormulario,
} from '@torres/shared';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { FormField } from '@/components/shared/form/FormField';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const BOTAO =
  'rounded-lg border bg-background text-sm font-medium transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden';
const BOTAO_ATIVO = 'border-primary bg-primary/10 text-foreground';

/** "Modalidade do contrato": três cartões, um por vez. */
export function SeletorModalidade() {
  const { setValue, control } = useFormContext<ContratoSalaFormulario>();
  const modalidade = useWatch({ control, name: 'modalidade' });

  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Modalidade do contrato
      </legend>
      <div role="radiogroup" className="grid gap-2 sm:grid-cols-3">
        {CONTRATO_MODALIDADES.map((opcao: ContratoModalidade) => (
          <button
            key={opcao}
            type="button"
            role="radio"
            aria-checked={modalidade === opcao}
            className={cn(BOTAO, 'p-3 text-left', modalidade === opcao && BOTAO_ATIVO)}
            onClick={() => setValue('modalidade', opcao, { shouldDirty: true })}
          >
            <span className="block">{CONTRATO_MODALIDADE_ROTULOS[opcao]}</span>
            <span className="block text-xs font-normal text-muted-foreground">
              {CONTRATO_MODALIDADE_DESCRICOES[opcao]}
            </span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** "Tipo de Locatário" (Profissional ou Cliente) e a busca do locatário no cadastro do tipo. */
export function SeletorLocatario() {
  const { setValue, control } = useFormContext<ContratoSalaFormulario>();
  const tipo = useWatch({ control, name: 'locatarioTipo' });

  return (
    <div className="grid gap-3">
      <fieldset className="grid gap-2">
        <legend className="mb-1 flex gap-1 text-sm leading-none font-medium">
          Tipo de Locatário
          <span aria-hidden className="text-destructive">
            *
          </span>
        </legend>
        <div role="radiogroup" className="flex gap-2">
          {CONTRATO_LOCATARIO_TIPOS.map((opcao: ContratoLocatarioTipo) => (
            <button
              key={opcao}
              type="button"
              role="radio"
              aria-checked={tipo === opcao}
              className={cn(
                BOTAO,
                'px-3 py-1.5',
                tipo === opcao && 'border-primary bg-primary text-primary-foreground',
              )}
              onClick={() => {
                if (tipo === opcao) return;
                setValue('locatarioTipo', opcao, { shouldDirty: true });
                setValue('locatarioId', '', { shouldDirty: true });
              }}
            >
              {CONTRATO_LOCATARIO_ROTULOS[opcao]}
            </button>
          ))}
        </div>
      </fieldset>
      <FormField
        key={tipo}
        name="locatarioId"
        label={tipo === 'CLIENTE' ? 'Cliente' : 'Profissional'}
        tipo="entidade"
        entidade={tipo === 'CLIENTE' ? 'pacientes' : 'profissionais'}
        placeholder={tipo === 'CLIENTE' ? 'Selecione cliente...' : 'Selecione profissional...'}
        obrigatorio
      />
    </div>
  );
}

/** Textos do `SeletorDias`; o padrão é o português do contrato (a tela Salas ainda não é traduzida). */
export interface TextosSeletorDias {
  legenda: string;
  as: string;
  nomeDia: (diaSemana: number) => string;
  abreviacao: (diaSemana: number) => string;
  horaInicial: (nomeDia: string) => string;
  horaFinal: (nomeDia: string) => string;
}

const TEXTOS_PADRAO: TextosSeletorDias = {
  legenda: 'Dias da semana',
  as: 'às',
  nomeDia: (diaSemana) => DIAS_SEMANA[diaSemana] ?? '',
  abreviacao: abreviarDiaSemana,
  horaInicial: (nome) => `${nome}: hora inicial`,
  horaFinal: (nome) => `${nome}: hora final`,
};

type FormularioComDias = Pick<ContratoSalaFormulario, 'dias'>;

/**
 * "Dias da semana": um botão por dia e, nos dias marcados, o horário de início e de fim. Serve a
 * qualquer formulário com o campo `dias` (contrato e bloqueio de sala, issue #138).
 */
export function SeletorDias({ textos = TEXTOS_PADRAO }: Readonly<{ textos?: TextosSeletorDias }>) {
  const { control, register, formState } = useFormContext<FormularioComDias>();
  const { fields, append, remove } = useFieldArray({ control, name: 'dias' });
  const erros = formState.errors.dias;
  // Erro da lista toda (ex.: nenhum dia marcado), não de uma linha.
  const erroLista = erros?.message ?? erros?.root?.message;

  function alternar(diaSemana: number) {
    const indice = fields.findIndex((campo) => campo.diaSemana === diaSemana);
    if (indice >= 0) remove(indice);
    else append({ diaSemana, ...CONTRATO_HORARIO_PADRAO });
  }

  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {textos.legenda}
      </legend>
      <div className="flex flex-wrap gap-2">
        {DIAS_SEMANA.map((_, diaSemana) => {
          const nome = textos.nomeDia(diaSemana);
          const marcado = fields.some((campo) => campo.diaSemana === diaSemana);
          return (
            <button
              key={nome}
              type="button"
              aria-pressed={marcado}
              title={nome}
              className={cn(
                BOTAO,
                'px-3 py-1.5',
                marcado && 'border-primary bg-primary text-primary-foreground',
              )}
              onClick={() => alternar(diaSemana)}
            >
              {textos.abreviacao(diaSemana)}
            </button>
          );
        })}
      </div>
      {erroLista && (
        <p role="alert" className="text-sm text-destructive">
          {erroLista}
        </p>
      )}
      {[...fields.keys()]
        .sort((a, b) => (fields[a]?.diaSemana ?? 0) - (fields[b]?.diaSemana ?? 0))
        .map((indice) => {
          const campo = fields[indice];
          if (!campo) return null;
          const nome = textos.nomeDia(campo.diaSemana);
          const erro = erros?.[indice]?.fim?.message ?? erros?.[indice]?.inicio?.message;
          return (
            <div key={campo.id} className="grid gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-20 text-sm">{nome}</span>
                <Label htmlFor={`dia-${campo.id}-inicio`} className="sr-only">
                  {textos.horaInicial(nome)}
                </Label>
                <Input
                  id={`dia-${campo.id}-inicio`}
                  type="time"
                  className="w-32"
                  aria-invalid={Boolean(erro)}
                  {...register(`dias.${indice}.inicio`)}
                />
                <span className="text-sm text-muted-foreground">{textos.as}</span>
                <Label htmlFor={`dia-${campo.id}-fim`} className="sr-only">
                  {textos.horaFinal(nome)}
                </Label>
                <Input
                  id={`dia-${campo.id}-fim`}
                  type="time"
                  className="w-32"
                  aria-invalid={Boolean(erro)}
                  {...register(`dias.${indice}.fim`)}
                />
              </div>
              {erro && (
                <p role="alert" className="text-sm text-destructive">
                  {erro}
                </p>
              )}
            </div>
          );
        })}
    </fieldset>
  );
}
