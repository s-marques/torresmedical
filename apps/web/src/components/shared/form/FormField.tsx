import { useId, type ReactNode } from 'react';
import { useController, useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { ControleCampo } from './ControleCampo';
import type { AriaCampo, FormFieldProps } from './tipos';

/**
 * Campo do `FormLayout`: rótulo, marcação de obrigatório, controle do tipo pedido, ajuda e
 * mensagem de erro (do Zod ou do servidor). Ex.:
 * `<FormField name="cpf" label="CPF" tipo="cpf" obrigatorio />`,
 * `<FormField name="pacienteId" label="Paciente" tipo="entidade" entidade="pacientes" />`.
 */
export function FormField(props: Readonly<FormFieldProps>) {
  if (props.tipo === 'periodo') return <CampoPeriodo {...props} />;
  return <CampoSimples {...props} />;
}

function CampoSimples(props: Readonly<Exclude<FormFieldProps, { tipo: 'periodo' }>>) {
  const { name, label, obrigatorio, descricao, className } = props;
  const { control } = useFormContext();
  const { field, fieldState } = useController({ name, control });
  const id = useId();
  const erro = fieldState.error?.message;
  const aria = ariaDoCampo(id, { erro, descricao, obrigatorio });
  const emLinha = props.tipo === 'checkbox' || props.tipo === 'switch';
  const controle = <ControleCampo campo={field} aria={aria} props={props} />;

  return (
    <div className={cn('grid content-start gap-2', className)}>
      <div className={cn(emLinha && 'flex items-center gap-2')}>
        {emLinha && controle}
        <div className={cn('flex gap-1', !emLinha && 'mb-2')}>
          <Label htmlFor={id}>{label}</Label>
          {obrigatorio && <Asterisco />}
        </div>
        {!emLinha && controle}
      </div>
      <Mensagens id={id} descricao={descricao} erros={[erro]} />
    </div>
  );
}

function CampoPeriodo(props: Readonly<Extract<FormFieldProps, { tipo: 'periodo' }>>) {
  const { name, nameAte, label, obrigatorio, descricao, disabled, className } = props;
  const { control } = useFormContext();
  const de = useController({ name, control });
  const ate = useController({ name: nameAte, control });
  const id = useId();
  const erros = [de.fieldState.error?.message, ate.fieldState.error?.message];
  const extremos = [
    { rotulo: 'De', controle: de.field, erro: erros[0] },
    { rotulo: 'até', controle: ate.field, erro: erros[1] },
  ];

  return (
    <fieldset className={cn('grid content-start gap-2', className)}>
      <legend className="mb-2 flex gap-1 text-sm leading-none font-medium">
        {label}
        {obrigatorio && <Asterisco />}
      </legend>
      <div className="flex flex-wrap items-center gap-2">
        {extremos.map(({ rotulo, controle, erro }, i) => {
          const idCampo = `${id}-${i}`;
          return (
            <div key={rotulo} className="flex items-center gap-2">
              <Label htmlFor={idCampo} className="font-normal">
                {rotulo}
              </Label>
              <Input
                {...controle}
                {...ariaDoCampo(idCampo, { erro, descricao, obrigatorio, idMensagens: id })}
                type="date"
                value={controle.value ?? ''}
                disabled={disabled}
                className="w-auto"
              />
            </div>
          );
        })}
      </div>
      <Mensagens id={id} descricao={descricao} erros={erros} />
    </fieldset>
  );
}

function ariaDoCampo(
  id: string,
  {
    erro,
    descricao,
    obrigatorio,
    idMensagens = id,
  }: { erro?: string; descricao?: ReactNode; obrigatorio?: boolean; idMensagens?: string },
): AriaCampo {
  const descritores = [descricao && `${idMensagens}-ajuda`, erro && `${idMensagens}-erro`];
  return {
    id,
    'aria-invalid': Boolean(erro),
    'aria-describedby': descritores.filter(Boolean).join(' ') || undefined,
    'aria-required': obrigatorio || undefined,
  };
}

/** Marca visual de obrigatório, fora do rótulo para o nome acessível ficar só com o texto. */
function Asterisco() {
  return (
    <span aria-hidden className="text-sm leading-none text-destructive">
      *
    </span>
  );
}

function Mensagens({
  id,
  descricao,
  erros,
}: Readonly<{ id: string; descricao?: ReactNode; erros: (string | undefined)[] }>) {
  const mensagens = [...new Set(erros.filter(Boolean))];
  return (
    <>
      {descricao && (
        <p id={`${id}-ajuda`} className="text-sm text-muted-foreground">
          {descricao}
        </p>
      )}
      {mensagens.length > 0 && (
        <p id={`${id}-erro`} className="text-sm text-destructive">
          {mensagens.join(' ')}
        </p>
      )}
    </>
  );
}
