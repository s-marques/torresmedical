import { FilePenLineIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AbaBlocos } from './AbaBlocos';
import { AbaPrescricoes } from './AbaPrescricoes';
import { ModalBloco } from './ModalBloco';
import { ModalPrescricao } from './ModalPrescricao';

type Aba = 'blocos' | 'prescricoes';

const PARAMETRO_ABA = 'aba';

/**
 * Receituários (`/receituarios`, docs/inventario/telas/consultorio-assistencial-receituarios.md):
 * controle de blocos e prescrições de receituários controlados. A aba fica na URL; ao trocar de
 * aba, busca, filtros e ordenação da outra aba são descartados (os grids guardam o estado na URL).
 */
export default function ReceituariosPage() {
  const [params, setParams] = useSearchParams();
  const aba: Aba = params.get(PARAMETRO_ABA) === 'prescricoes' ? 'prescricoes' : 'blocos';
  const [modal, setModal] = useState<Aba | null>(null);

  const trocarAba = (valor: string) => {
    setParams(valor === 'prescricoes' ? { [PARAMETRO_ABA]: valor } : {}, { replace: true });
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Receituarios ANVISA"
        descricao="Controle de blocos e prescricoes de receituarios controlados."
        acoes={
          <SePermitido permissao="consultorio-assistencial.receituarios.criar">
            {aba === 'blocos' ? (
              <Button type="button" onClick={() => setModal('blocos')}>
                <PlusIcon aria-hidden />
                Novo Bloco
              </Button>
            ) : (
              <Button type="button" onClick={() => setModal('prescricoes')}>
                <FilePenLineIcon aria-hidden />
                Nova Prescricao
              </Button>
            )}
          </SePermitido>
        }
      />
      <Tabs value={aba} onValueChange={trocarAba}>
        <TabsList>
          <TabsTrigger value="blocos">Blocos</TabsTrigger>
          <TabsTrigger value="prescricoes">Prescricoes</TabsTrigger>
        </TabsList>
        <TabsContent value="blocos" className="mt-4">
          <AbaBlocos />
        </TabsContent>
        <TabsContent value="prescricoes" className="mt-4">
          <AbaPrescricoes />
        </TabsContent>
      </Tabs>
      {modal === 'blocos' && <ModalBloco onFechar={() => setModal(null)} />}
      {modal === 'prescricoes' && <ModalPrescricao onFechar={() => setModal(null)} />}
    </div>
  );
}
