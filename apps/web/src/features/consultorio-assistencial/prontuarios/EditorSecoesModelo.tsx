import { MODELO_CAMPO_TIPOS } from '@torres/shared';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import {
  useController,
  useFieldArray,
  useFormContext,
  useFormState,
  useWatch,
} from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/shared/form/FormField';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { campoVazio, secaoVazia } from './campos-modelo';

/** Mensagem de erro de um nó do formulário (do Zod): a do próprio nó ou a da lista (`root`). */
function mensagemDe(erro: unknown): string | undefined {
  const e = erro as { message?: unknown; root?: { message?: unknown } } | undefined;
  const mensagem = e?.message ?? e?.root?.message;
  return typeof mensagem === 'string' ? mensagem : undefined;
}

/** Editor das seções do modelo: seções, campos de cada seção e as regras de cada tipo de campo. */
export function EditorSecoesModelo() {
  const { t } = useTranslation();
  const { control } = useFormContext();
  const { errors } = useFormState({ control, name: 'secoes' });
  const { fields, append, remove } = useFieldArray({ control, name: 'secoes' });

  return (
    <div className="col-span-full grid gap-4">
      <h3 className="text-sm font-medium">{t('modelosProntuario.campos.secoes')}</h3>
      {mensagemDe(errors.secoes) && (
        <p role="alert" className="text-sm text-destructive">
          {mensagemDe(errors.secoes)}
        </p>
      )}
      {fields.map((secao, indice) => (
        <fieldset key={secao.id} className="grid gap-3 rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">
            {t('modelosProntuario.secao', { numero: indice + 1 })}
          </legend>
          <div className="flex items-start gap-2">
            <FormField
              name={`secoes.${indice}.titulo`}
              label={t('modelosProntuario.campos.tituloSecao')}
              obrigatorio
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-7"
              aria-label={t('modelosProntuario.acoes.removerSecao', { numero: indice + 1 })}
              disabled={fields.length === 1}
              onClick={() => remove(indice)}
            >
              <Trash2Icon aria-hidden />
            </Button>
          </div>
          <CamposDaSecao indice={indice} />
        </fieldset>
      ))}
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        onClick={() => append(secaoVazia())}
      >
        <PlusIcon aria-hidden />
        {t('modelosProntuario.acoes.adicionarSecao')}
      </Button>
    </div>
  );
}

function CamposDaSecao({ indice }: Readonly<{ indice: number }>) {
  const { t } = useTranslation();
  const { control } = useFormContext();
  const nome = `secoes.${indice}.campos`;
  const { errors } = useFormState({ control, name: nome });
  const { fields, append, remove } = useFieldArray({ control, name: nome });
  const erroLista = mensagemDe(
    (errors.secoes as unknown as { campos?: unknown }[] | undefined)?.[indice]?.campos,
  );

  return (
    <div className="grid gap-3">
      {erroLista && (
        <p role="alert" className="text-sm text-destructive">
          {erroLista}
        </p>
      )}
      {fields.map((campo, j) => (
        <CampoDoEditor
          key={campo.id}
          prefixo={`${nome}.${j}`}
          numero={j + 1}
          onRemover={fields.length > 1 ? () => remove(j) : undefined}
        />
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => append(campoVazio())}
      >
        <PlusIcon aria-hidden />
        {t('modelosProntuario.acoes.adicionarCampo')}
      </Button>
    </div>
  );
}

function CampoDoEditor({
  prefixo,
  numero,
  onRemover,
}: Readonly<{ prefixo: string; numero: number; onRemover?: () => void }>) {
  const { t } = useTranslation();
  const { control } = useFormContext();
  const tipo = useWatch({ control, name: `${prefixo}.tipo` });
  const tipos = MODELO_CAMPO_TIPOS.map((valor) => ({
    valor,
    rotulo: t(`modelosProntuario.tiposCampo.${valor}`),
  }));

  return (
    <div
      role="group"
      aria-label={t('modelosProntuario.campo', { numero })}
      className="grid gap-3 rounded-md bg-muted/40 p-3 sm:grid-cols-2"
    >
      <FormField
        name={`${prefixo}.rotulo`}
        label={t('modelosProntuario.campos.rotulo')}
        obrigatorio
      />
      <FormField
        name={`${prefixo}.tipo`}
        label={t('modelosProntuario.campos.tipo')}
        tipo="select"
        opcoes={tipos}
      />
      {tipo === 'LISTA' && (
        <CampoOpcoes name={`${prefixo}.opcoes`} label={t('modelosProntuario.campos.opcoes')} />
      )}
      {(tipo === 'NUMERO' || tipo === 'ESCALA') && (
        <>
          <FormField
            name={`${prefixo}.min`}
            label={t('modelosProntuario.campos.min')}
            tipo="numero"
          />
          <FormField
            name={`${prefixo}.max`}
            label={t('modelosProntuario.campos.max')}
            tipo="numero"
          />
        </>
      )}
      <div className="flex items-center justify-between sm:col-span-2">
        <FormField
          name={`${prefixo}.obrigatorio`}
          label={t('modelosProntuario.campos.obrigatorio')}
          tipo="checkbox"
        />
        {onRemover && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t('modelosProntuario.acoes.removerCampo', { numero })}
            onClick={onRemover}
          >
            <Trash2Icon aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}

/** Opções da lista: uma por linha. O texto digitado fica local; o formulário guarda a lista. */
function CampoOpcoes({ name, label }: Readonly<{ name: string; label: string }>) {
  const { control } = useFormContext();
  const { field, fieldState } = useController({ name, control });
  const [texto, setTexto] = useState(() => ((field.value as string[] | null) ?? []).join('\n'));

  return (
    <div className="grid content-start gap-2 sm:col-span-2">
      <Label htmlFor={name}>{label}</Label>
      <Textarea
        id={name}
        value={texto}
        rows={4}
        aria-invalid={fieldState.error ? true : undefined}
        onBlur={field.onBlur}
        onChange={(evento) => {
          setTexto(evento.target.value);
          field.onChange(
            evento.target.value
              .split('\n')
              .map((linha) => linha.trim())
              .filter(Boolean),
          );
        }}
      />
      {mensagemDe(fieldState.error) && (
        <p role="alert" className="text-sm text-destructive">
          {mensagemDe(fieldState.error)}
        </p>
      )}
    </div>
  );
}
