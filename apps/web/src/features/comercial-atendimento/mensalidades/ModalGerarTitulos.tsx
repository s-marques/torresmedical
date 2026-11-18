import {
  gerarTitulosMensalidadesFormularioSchema,
  MESES,
  type GerarTitulosMensalidadesFormulario,
} from '@torres/shared';
import { useState } from 'react';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { useGerarTitulosMensalidades } from './use-mensalidades';

const ID_FORMULARIO = 'form-gerar-titulos';

const OPCOES_MES = MESES.map((rotulo, indice) => ({
  valor: String(indice + 1).padStart(2, '0'),
  rotulo,
}));

/** Mês e ano atuais: o modal abre com eles selecionados, como no print. */
function valoresIniciais(hoje: Date): GerarTitulosMensalidadesFormulario {
  return {
    mes: String(hoje.getMonth() + 1).padStart(2, '0'),
    ano: String(hoje.getFullYear()),
  };
}

/** Ano anterior, atual e os dois próximos. */
function opcoesAno(hoje: Date) {
  const atual = hoje.getFullYear();
  return [atual - 1, atual, atual + 1, atual + 2].map((ano) => ({
    valor: String(ano),
    rotulo: String(ano),
  }));
}

export interface ModalGerarTitulosProps {
  onFechar: () => void;
}

/** Modal "Gerar Titulos do Mes" (print do dev na issue #6). */
export function ModalGerarTitulos({ onFechar }: Readonly<ModalGerarTitulosProps>) {
  const [hoje] = useState(() => new Date());
  const gerar = useGerarTitulosMensalidades();
  const form = useFormulario(gerarTitulosMensalidadesFormularioSchema, {
    defaultValues: valoresIniciais(hoje),
  });

  return (
    <Modal
      aberto
      onAbertoChange={(aberto) => aberto || onFechar()}
      titulo="Gerar Títulos do Mês"
      descricao="Selecione o mês e ano para gerar os títulos a receber das mensalidades ativas."
      tamanho="sm"
      rodape={
        <FormAcoes
          form={form}
          formId={ID_FORMULARIO}
          rotuloEnviar="Gerar Títulos"
          onCancelar={onFechar}
        />
      }
    >
      <FormLayout
        id={ID_FORMULARIO}
        form={form}
        acoes={null}
        colunas={2}
        onSubmit={async (valores) => {
          await gerar.mutateAsync(valores);
          onFechar();
        }}
      >
        <FormField name="mes" label="Mês" tipo="select" opcoes={OPCOES_MES} obrigatorio />
        <FormField name="ano" label="Ano" tipo="select" opcoes={opcoesAno(hoje)} obrigatorio />
      </FormLayout>
    </Modal>
  );
}
