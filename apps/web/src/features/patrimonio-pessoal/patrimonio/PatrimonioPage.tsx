import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatarMoeda } from '@/lib/forms/mascaras';
import { AbaBens } from './AbaBens';
import { ModalBem } from './ModalBem';
import { useResumoPatrimonio } from './use-patrimonio';

type Aba = 'bens' | 'impostos' | 'alertas';

const ABAS: readonly Aba[] = ['bens', 'impostos', 'alertas'];
const PARAMETRO_ABA = 'aba';

/**
 * Patrimônio (`/patrimonio`, docs/inventario/telas/patrimonio-pessoal-patrimonio.md): bens do
 * cliente, com cartões de totais e as abas Bens, Impostos/Taxas e Alertas (a aba fica na URL).
 * Impostos/Taxas e Alertas mostram só o estado vazio do inventário: o cadastro de impostos e a
 * regra de alertas ainda não estão documentados.
 */
export default function PatrimonioPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const abaParam = params.get(PARAMETRO_ABA);
  const aba: Aba = ABAS.find((valor) => valor === abaParam) ?? 'bens';
  const [criando, setCriando] = useState(false);

  const trocarAba = (valor: string) => {
    setParams(valor === 'bens' ? {} : { [PARAMETRO_ABA]: valor }, { replace: true });
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo={t('patrimonio.titulo')}
        descricao={t('patrimonio.descricao')}
        acoes={
          <SePermitido permissao="patrimonio-pessoal.patrimonio.criar">
            <Button type="button" onClick={() => setCriando(true)}>
              <PlusIcon aria-hidden />
              {t('patrimonio.novo')}
            </Button>
          </SePermitido>
        }
      />
      <Resumo />
      <Tabs value={aba} onValueChange={trocarAba}>
        <TabsList>
          <TabsTrigger value="bens">{t('patrimonio.abas.bens')}</TabsTrigger>
          <TabsTrigger value="impostos">{t('patrimonio.abas.impostos')}</TabsTrigger>
          <TabsTrigger value="alertas">{t('patrimonio.abas.alertas')}</TabsTrigger>
        </TabsList>
        <TabsContent value="bens" className="mt-4">
          <AbaBens />
        </TabsContent>
        <TabsContent value="impostos" className="mt-4">
          <Card>
            <CardContent className="grid justify-items-center gap-4 py-4 text-center">
              <p className="text-muted-foreground">{t('patrimonio.impostos.vazio')}</p>
              <Button type="button" variant="outline" onClick={() => trocarAba('bens')}>
                {t('patrimonio.impostos.irParaBens')}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="alertas" className="mt-4">
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-muted-foreground">{t('patrimonio.alertas.vazio')}</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      {criando && <ModalBem onFechar={() => setCriando(false)} />}
    </div>
  );
}

/** Cartões do topo: Valor Total Patrimônio, Impostos Pendentes e Alertas Próximos. */
function Resumo() {
  const { t } = useTranslation();
  const resumo = useResumoPatrimonio().data;
  const cartoes = [
    ['valorTotal', resumo ? formatarMoeda(resumo.valorTotal) : undefined],
    ['impostosPendentes', resumo?.impostosPendentes],
    ['alertasProximos', resumo?.alertasProximos],
  ] as const;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {cartoes.map(([chave, valor]) => (
        <Card key={chave}>
          <CardContent className="grid gap-1">
            <span className="text-sm text-muted-foreground">{t(`patrimonio.resumo.${chave}`)}</span>
            <span className="text-2xl font-semibold" data-testid={`resumo-${chave}`}>
              {valor ?? '-'}
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
