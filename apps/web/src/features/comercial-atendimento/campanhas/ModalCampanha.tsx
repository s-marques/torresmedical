import {
  CAMPANHA_INTERVALO_PADRAO,
  campanhaInputSchema,
  type Campanha,
  type CampanhaFormulario,
} from '@torres/shared';
import { useState } from 'react';
import { FormAcoes } from '@/components/shared/form/FormAcoes';
import { FormField } from '@/components/shared/form/FormField';
import { FormLayout } from '@/components/shared/form/FormLayout';
import { useFormulario } from '@/components/shared/form/use-formulario';
import { Modal } from '@/components/shared/Modal';
import { partesDataHora } from '../atividades/partes-data-hora';
import { BotaoVisualizarClientes, CamposFiltro } from './CamposFiltro';
import { ModalDestinatarios } from './ModalDestinatarios';
import { AJUDA_VARIAVEIS, OPCOES_TIPO_ENVIO } from './textos';
import { useSalvarCampanha, type FiltroConsulta } from './use-campanhas';

const ID_FORMULARIO = 'form-campanha';

function valoresIniciais(campanha?: Campanha): CampanhaFormulario {
  const quando = campanha ? partesDataHora(campanha.agendadaPara) : { data: '', hora: '' };
  return {
    nome: campanha?.nome ?? '',
    tipoEnvio: campanha?.tipoEnvio ?? 'TEXTO',
    canalId: campanha?.canalId ?? (null as unknown as string),
    filtro: campanha?.filtro ?? 'TODOS',
    origemClienteId: campanha?.origemClienteId ?? null,
    diasCompra: campanha?.diasCompra ?? null,
    quantidade: campanha?.quantidade ?? null,
    intervaloSegundos: campanha?.intervaloSegundos ?? CAMPANHA_INTERVALO_PADRAO,
    data: quando.data,
    hora: quando.hora,
    mensagem: campanha?.mensagem ?? '',
  };
}

export interface ModalCampanhaProps {
  /** Sem campanha: "Nova Campanha". Com campanha agendada: "Editar Campanha". */
  campanha?: Campanha;
  onFechar: () => void;
}

/** Modal "Nova Campanha" (docs/inventario/telas/comercial-atendimento-campanhas.md). */
export function ModalCampanha({ campanha, onFechar }: Readonly<ModalCampanhaProps>) {
  const salvar = useSalvarCampanha(campanha?.id);
  const form = useFormulario(campanhaInputSchema, { defaultValues: valoresIniciais(campanha) });
  const [visualizando, setVisualizando] = useState<FiltroConsulta | null>(null);

  return (
    <>
      <Modal
        aberto
        tamanho="lg"
        onAbertoChange={(aberto) => aberto || onFechar()}
        titulo={campanha ? 'Editar Campanha' : 'Nova Campanha'}
        rodape={
          <FormAcoes
            form={form}
            formId={ID_FORMULARIO}
            rotuloEnviar={campanha ? 'Salvar' : 'Criar Campanha'}
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
            await salvar.mutateAsync(valores);
            onFechar();
          }}
        >
          <FormField
            name="nome"
            label="Nome da Campanha"
            placeholder="Ex: Promoção de Maio"
            obrigatorio
            className="sm:col-span-2"
          />
          <FormField
            name="tipoEnvio"
            label="Tipo de Envio"
            tipo="select"
            opcoes={OPCOES_TIPO_ENVIO}
          />
          <FormField
            name="canalId"
            label="Canal WhatsApp"
            tipo="entidade"
            entidade="canais-whatsapp"
            placeholder="Selecione"
            obrigatorio
          />
          <CamposFiltro />
          <BotaoVisualizarClientes onVisualizar={setVisualizando} />
          <FormField
            name="quantidade"
            label="Quantidade de Envios"
            tipo="numero"
            placeholder="Todos"
            descricao="Vazio = envia para todos"
          />
          <FormField name="intervaloSegundos" label="Intervalo entre envios (seg)" tipo="numero" />
          <FormField
            name="data"
            label="Data do Envio"
            tipo="data"
            descricao="Vazio = envia no próximo minuto"
          />
          <FormField name="hora" label="Hora do Envio" tipo="hora" />
          <FormField
            name="mensagem"
            label="Mensagem"
            tipo="textarea"
            placeholder="Digite a mensagem..."
            descricao={AJUDA_VARIAVEIS}
            obrigatorio
            className="sm:col-span-2"
          />
        </FormLayout>
      </Modal>
      {visualizando && (
        <ModalDestinatarios filtro={visualizando} onFechar={() => setVisualizando(null)} />
      )}
    </>
  );
}
