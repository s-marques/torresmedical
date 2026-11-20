import { PlusIcon, TagIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { EntitySelect } from '@/components/shared/EntitySelect';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AbaLicencas } from './AbaLicencas';
import { AbaVencimentos } from './AbaVencimentos';
import { ModalLicenca } from './ModalLicenca';
import { ModalTipoLicenca } from './ModalTipoLicenca';
import { useResumoLicencas } from './use-alvaras-licencas';

type Aba = 'licencas' | 'alertas' | 'ordem-renovacao';

const ABAS: readonly Aba[] = ['licencas', 'alertas', 'ordem-renovacao'];
const PARAMETRO_ABA = 'aba';

/**
 * Alvarás e Licenças (`/alvaras`, docs/inventario/telas/regulatorio-qualidade-alvaras-e-licencas.md):
 * controle de alvarás, licenças e certidões por unidade. A unidade escolhida filtra os totais e as
 * três abas (Licencas, Alertas, Ordem Renovacao); a aba fica na URL.
 */
export default function AlvarasLicencasPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const abaParam = params.get(PARAMETRO_ABA);
  const aba: Aba = ABAS.find((valor) => valor === abaParam) ?? 'licencas';
  const [unidadeId, setUnidadeId] = useState('');
  const [modal, setModal] = useState<'tipo' | 'licenca' | null>(null);

  const trocarAba = (valor: string) => {
    setParams(valor === 'licencas' ? {} : { [PARAMETRO_ABA]: valor }, { replace: true });
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo={t('alvarasLicencas.titulo')}
        descricao={t('alvarasLicencas.descricao')}
        acoes={
          <SePermitido permissao="regulatorio-qualidade.alvaras-licencas.criar">
            <Button type="button" variant="outline" onClick={() => setModal('tipo')}>
              <TagIcon aria-hidden />
              {t('alvarasLicencas.novoTipo')}
            </Button>
            <Button type="button" onClick={() => setModal('licenca')}>
              <PlusIcon aria-hidden />
              {t('alvarasLicencas.novaLicenca')}
            </Button>
          </SePermitido>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Label>{t('alvarasLicencas.unidade')}</Label>
        <EntitySelect
          entidade="unidades"
          value={unidadeId}
          onChange={(id) => setUnidadeId(id ?? '')}
          placeholder={t('alvarasLicencas.todasUnidades')}
          aria-label={t('alvarasLicencas.unidade')}
          className="w-64"
        />
      </div>
      <Resumo unidadeId={unidadeId} />
      <Tabs value={aba} onValueChange={trocarAba}>
        <TabsList>
          <TabsTrigger value="licencas">{t('alvarasLicencas.abas.licencas')}</TabsTrigger>
          <TabsTrigger value="alertas">{t('alvarasLicencas.abas.alertas')}</TabsTrigger>
          <TabsTrigger value="ordem-renovacao">
            {t('alvarasLicencas.abas.ordemRenovacao')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="licencas" className="mt-4">
          <AbaLicencas unidadeId={unidadeId} />
        </TabsContent>
        <TabsContent value="alertas" className="mt-4">
          <AbaVencimentos recurso="alertas" unidadeId={unidadeId} />
        </TabsContent>
        <TabsContent value="ordem-renovacao" className="mt-4">
          <AbaVencimentos recurso="ordem-renovacao" unidadeId={unidadeId} />
        </TabsContent>
      </Tabs>
      {modal === 'tipo' && <ModalTipoLicenca onFechar={() => setModal(null)} />}
      {modal === 'licenca' && (
        <ModalLicenca unidadeIdPadrao={unidadeId} onFechar={() => setModal(null)} />
      )}
    </div>
  );
}

/** Cartões de totais: Total, OK, Alerta (60 e 30 dias), Vencido e N/A. */
function Resumo({ unidadeId }: Readonly<{ unidadeId: string }>) {
  const { t } = useTranslation();
  const resumo = useResumoLicencas(unidadeId).data;
  const cartoes = [
    ['total', resumo?.total],
    ['ok', resumo?.ok],
    ['alerta', resumo ? resumo.alerta60 + resumo.alerta30 : undefined],
    ['vencido', resumo?.vencido],
    ['na', resumo?.naoSeAplica],
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cartoes.map(([chave, valor]) => (
        <Card key={chave}>
          <CardContent className="grid gap-1">
            <span className="text-sm text-muted-foreground">
              {t(`alvarasLicencas.resumo.${chave}`)}
            </span>
            <span className="text-2xl font-semibold" data-testid={`resumo-${chave}`}>
              {valor ?? '-'}
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
