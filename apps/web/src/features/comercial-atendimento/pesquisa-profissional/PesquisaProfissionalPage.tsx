import { SendIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EntitySelect } from '@/components/shared/EntitySelect';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { periodoPadrao } from '../pesquisa-nps/periodo';
import { AbaConfiguracao } from './AbaConfiguracao';
import { AbaRespostas } from './AbaRespostas';
import { AbaResultados } from './AbaResultados';
import { useRecarregarPesquisaProfissional } from './use-pesquisa-profissional';

/**
 * Pesquisa do Profissional (`/pesquisa-profissional`, issue #145, R §36): a clínica mede a
 * satisfação de quem usa o Torres (Estrutura, Recepção, Agenda e Atendimento, em estrelas, mais
 * NPS). Tela fora do inventário, criada a partir dos requisitos do cliente.
 *
 * O período aplicado ("Carregar") e o profissional escolhido são um só e valem para Resultados e
 * Respostas: o NPS de um recorte nunca abre as respostas de outro (falha C3 do legado).
 */
export default function PesquisaProfissionalPage() {
  const { t } = useTranslation();
  const [rascunho, setRascunho] = useState(periodoPadrao);
  const [profissionalId, setProfissionalId] = useState<string | null>(null);
  const [aplicado, setAplicado] = useState({ ...rascunho, profissionalId: null as string | null });
  const [aba, setAba] = useState('resultados');
  const recarregar = useRecarregarPesquisaProfissional();
  const filtro = {
    de: aplicado.de,
    ate: aplicado.ate,
    ...(aplicado.profissionalId ? { profissionalId: aplicado.profissionalId } : {}),
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo={t('pesquisaProfissional.titulo')}
        descricao={t('pesquisaProfissional.descricao')}
      />
      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="resultados">{t('pesquisaProfissional.abas.resultados')}</TabsTrigger>
          <TabsTrigger value="respostas">{t('pesquisaProfissional.abas.respostas')}</TabsTrigger>
          <TabsTrigger value="configuracao">
            {t('pesquisaProfissional.abas.configuracao')}
          </TabsTrigger>
        </TabsList>
        {/* A Configuração não tem filtro. */}
        <form
          hidden={aba === 'configuracao'}
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const novo = { ...rascunho, profissionalId };
            const igual =
              novo.de === aplicado.de &&
              novo.ate === aplicado.ate &&
              novo.profissionalId === aplicado.profissionalId;
            // Mesmo filtro: só recarrega os dados.
            if (igual) void recarregar();
            else setAplicado(novo);
          }}
        >
          <div className="grid gap-1">
            <Label htmlFor="pesquisa-profissional-de">{t('pesquisaProfissional.filtros.de')}</Label>
            <Input
              id="pesquisa-profissional-de"
              type="date"
              className="w-44"
              value={rascunho.de}
              onChange={(e) => setRascunho((r) => ({ ...r, de: e.target.value }))}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="pesquisa-profissional-ate">
              {t('pesquisaProfissional.filtros.ate')}
            </Label>
            <Input
              id="pesquisa-profissional-ate"
              type="date"
              className="w-44"
              value={rascunho.ate}
              onChange={(e) => setRascunho((r) => ({ ...r, ate: e.target.value }))}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="pesquisa-profissional-profissional">
              {t('pesquisaProfissional.filtros.profissional')}
            </Label>
            <EntitySelect
              id="pesquisa-profissional-profissional"
              entidade="profissionais"
              value={profissionalId}
              onChange={(id) => setProfissionalId(id)}
              placeholder={t('pesquisaProfissional.filtros.todosProfissionais')}
              className="w-64"
            />
          </div>
          <Button type="submit" disabled={!rascunho.de || !rascunho.ate}>
            <SendIcon aria-hidden />
            {t('pesquisaProfissional.filtros.carregar')}
          </Button>
        </form>
        <TabsContent value="resultados" className="mt-4">
          <AbaResultados {...filtro} />
        </TabsContent>
        <TabsContent value="respostas" className="mt-4">
          <AbaRespostas {...filtro} />
        </TabsContent>
        <TabsContent value="configuracao" className="mt-4">
          <AbaConfiguracao />
        </TabsContent>
      </Tabs>
    </div>
  );
}
