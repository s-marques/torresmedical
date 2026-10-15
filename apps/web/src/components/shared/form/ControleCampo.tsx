import type { ReactNode } from 'react';
import type { ControllerRenderProps, FieldValues } from 'react-hook-form';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  digitosDaMascara,
  formatarMascara,
  formatarMoeda,
  MASCARAS,
  moedaDoTexto,
  type TipoMascara,
} from '@/lib/forms/mascaras';
import { EntitySelect } from '../EntitySelect';
import type { AriaCampo, FormFieldProps } from './tipos';

type Campo = ControllerRenderProps<FieldValues, string>;
type PropsControle = Exclude<FormFieldProps, { tipo: 'periodo' }>;

interface Contexto {
  campo: Campo;
  aria: AriaCampo;
  props: PropsControle;
}

const TIPO_INPUT = { texto: 'text', email: 'email', senha: 'password' } as const;

function texto({ campo, aria, props }: Contexto, tipo: keyof typeof TIPO_INPUT) {
  return (
    <Input
      {...campo}
      {...aria}
      type={TIPO_INPUT[tipo]}
      value={campo.value ?? ''}
      placeholder={props.placeholder}
      disabled={props.disabled}
      autoComplete={tipo === 'senha' ? 'current-password' : undefined}
    />
  );
}

function mascara({ campo, aria, props }: Contexto, tipo: TipoMascara) {
  return (
    <Input
      {...campo}
      {...aria}
      inputMode="numeric"
      value={formatarMascara(tipo, campo.value)}
      onChange={(evento) => campo.onChange(digitosDaMascara(tipo, evento.target.value))}
      placeholder={
        props.placeholder ?? MASCARAS[tipo].formatar('0'.repeat(MASCARAS[tipo].maxDigitos))
      }
      disabled={props.disabled}
    />
  );
}

const RENDERIZADORES: Record<
  Exclude<NonNullable<PropsControle['tipo']>, TipoMascara | keyof typeof TIPO_INPUT>,
  (contexto: Contexto) => ReactNode
> = {
  numero: ({ campo, aria, props }) => (
    <Input
      {...campo}
      {...aria}
      type="number"
      inputMode="decimal"
      value={campo.value ?? ''}
      onChange={(evento) =>
        campo.onChange(evento.target.value === '' ? null : evento.target.valueAsNumber)
      }
      placeholder={props.placeholder}
      disabled={props.disabled}
    />
  ),
  moeda: ({ campo, aria, props }) => (
    <Input
      {...campo}
      {...aria}
      inputMode="numeric"
      value={formatarMoeda(campo.value)}
      onChange={(evento) => campo.onChange(moedaDoTexto(evento.target.value))}
      placeholder={props.placeholder ?? formatarMoeda(0)}
      disabled={props.disabled}
    />
  ),
  data: ({ campo, aria, props }) => (
    <Input {...campo} {...aria} type="date" value={campo.value ?? ''} disabled={props.disabled} />
  ),
  textarea: ({ campo, aria, props }) => (
    <Textarea
      {...campo}
      {...aria}
      value={campo.value ?? ''}
      placeholder={props.placeholder}
      disabled={props.disabled}
    />
  ),
  checkbox: ({ campo, aria, props }) => (
    <Checkbox
      {...aria}
      ref={campo.ref}
      name={campo.name}
      checked={campo.value === true}
      onCheckedChange={(marcado) => campo.onChange(marcado === true)}
      onBlur={campo.onBlur}
      disabled={props.disabled}
    />
  ),
  switch: ({ campo, aria, props }) => (
    <Switch
      {...aria}
      ref={campo.ref}
      name={campo.name}
      checked={campo.value === true}
      onCheckedChange={campo.onChange}
      onBlur={campo.onBlur}
      disabled={props.disabled}
    />
  ),
  select: ({ campo, aria, props }) => (
    <Select
      name={campo.name}
      value={campo.value ?? ''}
      onValueChange={campo.onChange}
      onOpenChange={(aberto) => aberto || campo.onBlur()}
      disabled={props.disabled}
    >
      <SelectTrigger {...aria} ref={campo.ref} className="w-full">
        <SelectValue placeholder={props.placeholder ?? 'Selecione'} />
      </SelectTrigger>
      <SelectContent>
        {props.tipo === 'select' &&
          props.opcoes.map((opcao) => (
            <SelectItem key={opcao.valor} value={opcao.valor}>
              {opcao.rotulo}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  ),
  entidade: ({ campo, aria, props }) =>
    props.tipo === 'entidade' && (
      <EntitySelect
        id={aria.id}
        aria-invalid={aria['aria-invalid']}
        aria-describedby={aria['aria-describedby']}
        entidade={props.entidade}
        filtros={props.filtros}
        value={campo.value}
        onChange={(id) => {
          campo.onChange(id);
          campo.onBlur();
        }}
        placeholder={props.placeholder}
        disabled={props.disabled}
      />
    ),
};

function ehMascara(tipo: string): tipo is TipoMascara {
  return tipo in MASCARAS;
}

function ehTexto(tipo: string): tipo is keyof typeof TIPO_INPUT {
  return tipo in TIPO_INPUT;
}

/** Controle do `FormField` para o tipo pedido. */
export function ControleCampo(contexto: Readonly<Contexto>) {
  const tipo = contexto.props.tipo ?? 'texto';
  if (ehTexto(tipo)) return texto(contexto, tipo);
  if (ehMascara(tipo)) return mascara(contexto, tipo);
  return RENDERIZADORES[tipo](contexto);
}
