import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AbaChecklists } from './AbaChecklists';
import { AbaFilaDia } from './AbaFilaDia';
import { AbaPacotes } from './AbaPacotes';

const ABAS = ['fila-dia', 'pacotes', 'em-andamento', 'historico'] as const;
type Aba = (typeof ABAS)[number];

const PARAMETRO_ABA = 'aba';

const ROTULOS: Record<Aba, string> = {
  'fila-dia': 'soroterapia.abas.filaDia',
  pacotes: 'soroterapia.abas.pacotes',
  'em-andamento': 'soroterapia.abas.emAndamento',
  historico: 'soroterapia.abas.historico',
};

const ehAba = (valor: string | null): valor is Aba => ABAS.some((aba) => aba === valor);

/**
 * Soroterapia (`/soroterapia`, docs/inventario/telas/consultorio-assistencial-soroterapia.md):
 * "Checklists de infusao e soroterapia". Só leitura nesta entrega: o fluxo do checklist ainda não
 * está documentado. A aba fica na URL; ao trocá-la, busca, filtros e ordenação da outra são
 * descartados (os grids guardam o estado na URL).
 */
export default function SoroterapiaPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const valor = params.get(PARAMETRO_ABA);
  const aba: Aba = ehAba(valor) ? valor : 'fila-dia';

  const trocarAba = (nova: string) => {
    setParams(nova === 'fila-dia' ? {} : { [PARAMETRO_ABA]: nova }, { replace: true });
  };

  return (
    <div className="grid gap-6">
      <PageHeader titulo={t('soroterapia.titulo')} descricao={t('soroterapia.descricao')} />
      <Tabs value={aba} onValueChange={trocarAba}>
        <TabsList aria-label={t('soroterapia.abas.rotulo')}>
          {ABAS.map((id) => (
            <TabsTrigger key={id} value={id}>
              {t(ROTULOS[id])}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="fila-dia" className="mt-4">
          <AbaFilaDia />
        </TabsContent>
        <TabsContent value="pacotes" className="mt-4">
          <AbaPacotes />
        </TabsContent>
        <TabsContent value="em-andamento" className="mt-4">
          <AbaChecklists historico={false} />
        </TabsContent>
        <TabsContent value="historico" className="mt-4">
          <AbaChecklists historico />
        </TabsContent>
      </Tabs>
    </div>
  );
}
