import {
  compararCodigosConta,
  createPlanoContaSchema,
  type PlanoConta,
  type PlanoContaTipo,
} from '@torres/shared';
import { z } from 'zod';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { OPCOES_TIPO } from './opcoes';
import { useCriarConta, useEditarConta } from './use-plano-contas';

const ID_FORMULARIO = 'form-plano-conta';

/** O combo não aceita valor vazio, então "Nenhuma (raiz)" tem um valor próprio no formulário. */
const RAIZ = 'raiz';

const formularioSchema = createPlanoContaSchema.extend({
  contaPaiId: z
    .string()
    .transform((valor) => (valor === RAIZ ? null : valor))
    .pipe(z.uuid({ error: 'Conta pai inválida' }).nullable()),
});

export interface ModalPlanoContaProps {
  /** Sem conta: "Nova Conta". Com conta: "Editar Conta". */
  conta?: PlanoConta;
  /** Todas as contas, para o combo "Conta Pai". */
  contas: readonly PlanoConta[];
  onFechar: () => void;
}

/** Ids da conta e de suas descendentes: não podem ser escolhidos como pai (a API também valida). */
function idsBloqueados(conta: PlanoConta | undefined, contas: readonly PlanoConta[]) {
  const bloqueados = new Set<string>();
  if (!conta) return bloqueados;
  bloqueados.add(conta.id);
  for (let mudou = true; mudou;) {
    mudou = false;
    for (const c of contas) {
      if (c.contaPaiId && bloqueados.has(c.contaPaiId) && !bloqueados.has(c.id)) {
        bloqueados.add(c.id);
        mudou = true;
      }
    }
  }
  return bloqueados;
}

export function ModalPlanoConta({ conta, contas, onFechar }: Readonly<ModalPlanoContaProps>) {
  const criar = useCriarConta();
  const editar = useEditarConta(conta?.id ?? '');
  const form = useFormulario(formularioSchema, {
    defaultValues: {
      codigo: conta?.codigo ?? '',
      tipo: (conta?.tipo.toLowerCase() as PlanoContaTipo | undefined) ?? 'despesa',
      nome: conta?.nome ?? '',
      contaPaiId: conta?.contaPaiId ?? RAIZ,
    },
  });

  const bloqueados = idsBloqueados(conta, contas);
  const opcoesPai = [
    { valor: RAIZ, rotulo: 'Nenhuma (raiz)' },
    ...[...contas]
      .filter((c) => !bloqueados.has(c.id))
      .sort((a, b) => compararCodigosConta(a.codigo, b.codigo))
      .map((c) => ({ valor: c.id, rotulo: `${c.codigo} - ${c.nome}` })),
  ];

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo={conta ? 'Editar Conta' : 'Nova Conta'}
      rodape={
        <FormAcoes form={form} formId={ID_FORMULARIO} rotuloEnviar="Salvar" onCancelar={onFechar} />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        colunas={2}
        onSubmit={async (valores) => {
          await (conta ? editar : criar).mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField name="codigo" label="Código" obrigatorio />
        <FormField name="tipo" label="Tipo" tipo="select" opcoes={OPCOES_TIPO} obrigatorio />
        <FormField name="nome" label="Nome" obrigatorio className="sm:col-span-2" />
        <FormField
          name="contaPaiId"
          label="Conta Pai"
          tipo="select"
          opcoes={opcoesPai}
          className="sm:col-span-2"
        />
      </FormLayout>
    </Modal>
  );
}
