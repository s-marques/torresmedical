import { useId, useState } from 'react';
import { z } from 'zod';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import type { FormFieldProps } from '@/components/shared/form/tipos';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RESPOSTAS_SIMULADAS, simularEnvio, type RespostaSimulada } from './exemplos';

const obrigatorio = (mensagem: string) => z.string().trim().min(1, { error: mensagem });

/** Schema só do exemplo. Nas telas, o schema vem de `@torres/shared`. */
const schema = z.object({
  nome: obrigatorio('Informe o nome'),
  email: z.union([z.literal(''), z.email({ error: 'E-mail inválido' })]),
  cpf: z.string().length(11, { error: 'CPF inválido' }),
  telefone: z.string(),
  cep: z.string(),
  documento: z.string(),
  valor: z.number({ error: 'Informe o valor' }).positive({ error: 'Informe o valor' }),
  quantidade: z.number().int({ error: 'Quantidade inválida' }).nullable(),
  nascimento: z.string(),
  inicio: z.string(),
  fim: z.string(),
  tipo: obrigatorio('Selecione o tipo'),
  pacienteId: z.string().nullable(),
  observacao: z.string().max(200, { error: 'No máximo 200 caracteres' }),
  aceite: z.boolean(),
  ativo: z.boolean(),
});

type Valores = z.input<typeof schema>;

const VALORES_INICIAIS: Valores = {
  nome: '',
  email: '',
  cpf: '',
  telefone: '',
  cep: '',
  documento: '',
  valor: 0,
  quantidade: null,
  nascimento: '',
  inicio: '',
  fim: '',
  tipo: '',
  pacienteId: null,
  observacao: '',
  aceite: false,
  ativo: true,
};

const CAMPOS: FormFieldProps[] = [
  { name: 'nome', label: 'Nome', obrigatorio: true, descricao: 'Texto simples.' },
  { name: 'email', label: 'E-mail', tipo: 'email' },
  {
    name: 'cpf',
    label: 'CPF',
    tipo: 'cpf',
    obrigatorio: true,
    descricao: 'Guardado só com os dígitos.',
  },
  { name: 'telefone', label: 'Telefone', tipo: 'telefone' },
  { name: 'cep', label: 'CEP', tipo: 'cep' },
  { name: 'documento', label: 'CPF/CNPJ', tipo: 'cpf-cnpj' },
  { name: 'valor', label: 'Valor', tipo: 'moeda', obrigatorio: true },
  { name: 'quantidade', label: 'Quantidade', tipo: 'numero' },
  { name: 'nascimento', label: 'Nascimento', tipo: 'data' },
  { name: 'inicio', nameAte: 'fim', label: 'Período', tipo: 'periodo' },
  {
    name: 'tipo',
    label: 'Tipo',
    tipo: 'select',
    obrigatorio: true,
    opcoes: ['Consulta', 'Retorno', 'Procedimento'].map((rotulo) => ({
      valor: rotulo.toLowerCase(),
      rotulo,
    })),
  },
  {
    name: 'pacienteId',
    label: 'Paciente',
    tipo: 'entidade',
    entidade: 'pacientes',
    descricao: 'Combobox com busca na API (EntitySelect).',
  },
  { name: 'observacao', label: 'Observação', tipo: 'textarea', className: 'sm:col-span-2' },
  { name: 'aceite', label: 'Confirmo os dados', tipo: 'checkbox' },
  { name: 'ativo', label: 'Ativo', tipo: 'switch' },
];

/** Todos os tipos de campo do `FormField`, com erros simulados do servidor. */
export function ExemploFormulario() {
  const form = useFormulario(schema, { defaultValues: VALORES_INICIAIS });
  const [resposta, setResposta] = useState<RespostaSimulada>('sucesso');
  const [enviado, setEnviado] = useState<z.output<typeof schema> | null>(null);
  const idResposta = useId();

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <Label htmlFor={idResposta}>Resposta simulada do servidor:</Label>
        <Select value={resposta} onValueChange={(valor) => setResposta(valor as RespostaSimulada)}>
          <SelectTrigger id={idResposta} size="sm" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(RESPOSTAS_SIMULADAS).map(([valor, rotulo]) => (
              <SelectItem key={valor} value={valor}>
                {rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <FormLayout
        form={form}
        colunas={2}
        onCancelar={() => {
          form.reset();
          setEnviado(null);
        }}
        onSubmit={async (valores) => {
          setEnviado(null);
          await simularEnvio(resposta, 'cpf');
          setEnviado(valores);
        }}
      >
        {CAMPOS.map((campo) => (
          <FormField key={campo.name} {...campo} />
        ))}
      </FormLayout>
      {enviado && (
        <pre
          aria-label="Valores enviados"
          className="overflow-x-auto rounded-md bg-muted p-3 text-xs"
        >
          {JSON.stringify(enviado, null, 2)}
        </pre>
      )}
    </div>
  );
}
