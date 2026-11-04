import {
  cargoPageSchema,
  comissaoPageSchema,
  exportCargosQuerySchema,
  exportFuncionariosQuerySchema,
  FUNCIONARIO_TIPO_CONTRATO_ROTULOS,
  funcionarioPageSchema,
  listCargosQuerySchema,
  listComissoesQuerySchema,
  listFuncionariosQuerySchema,
  type Cargo,
  type Comissao,
  type Funcionario,
} from '@torres/shared';
import { DollarSignIcon, PencilIcon, PlusIcon, PowerIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataGrid } from '@/components/shared/data-grid/DataGrid';
import type { ColunaGrid, ExportacaoGrid, FiltroStatus } from '@/components/shared/data-grid/tipos';
import { EmptyState } from '@/components/shared/EmptyState';
import { PageHeader } from '@/components/shared/PageHeader';
import { SePermitido } from '@/components/shared/SePermitido';
import { StatusAtivo, StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatarMascara, formatarMoeda } from '@/lib/forms/mascaras';
import { formatarData } from '@/lib/formatar';
import { ModalCargo } from './ModalCargo';
import { ModalComissao } from './ModalComissao';
import { ModalFuncionario } from './ModalFuncionario';
import { URL_CARGOS, useExcluirCargo } from './use-cargos';
import { urlComissoes, useExcluirComissao } from './use-comissoes';
import {
  URL_FUNCIONARIOS,
  useDesativarFuncionario,
  useExcluirFuncionario,
} from './use-funcionarios';

const STATUS: FiltroStatus = {
  opcoes: [
    { valor: 'ativo', rotulo: 'Ativo' },
    { valor: 'inativo', rotulo: 'Inativo' },
  ],
};

/** Valores decimais chegam da API como texto exato (ex.: `"8000.00"`). */
function moeda(valor: string | null): string {
  return valor === null ? '-' : formatarMoeda(Number(valor));
}

/**
 * Tela "Funcionários" (`/funcionarios`, docs/inventario/telas/regulatorio-qualidade-funcionarios.md):
 * três abas (Funcionarios, Cargos, Comissoes). A aba "Comissoes" mostra os lançamentos do
 * funcionário selecionado pela ação "Comissões" da aba "Funcionarios".
 */
export default function FuncionariosPage() {
  const [aba, setAba] = useState('funcionarios');
  const [funcionarioComissoes, setFuncionarioComissoes] = useState<Funcionario | null>(null);
  const [criandoFuncionario, setCriandoFuncionario] = useState(false);
  const [criandoCargo, setCriandoCargo] = useState(false);
  const [criandoComissao, setCriandoComissao] = useState(false);

  function abrirComissoes(funcionario: Funcionario) {
    setFuncionarioComissoes(funcionario);
    setAba('comissoes');
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        titulo="Recursos Humanos"
        descricao="Gerencie funcionarios, cargos e comissoes."
        acoes={
          <>
            {aba === 'funcionarios' && (
              <SePermitido permissao="regulatorio-qualidade.funcionarios.criar">
                <Button type="button" onClick={() => setCriandoFuncionario(true)}>
                  <PlusIcon aria-hidden />
                  Novo Funcionario
                </Button>
              </SePermitido>
            )}
            {aba === 'cargos' && (
              <SePermitido permissao="regulatorio-qualidade.funcionarios.criar">
                <Button type="button" onClick={() => setCriandoCargo(true)}>
                  <PlusIcon aria-hidden />
                  Novo Cargo
                </Button>
              </SePermitido>
            )}
            {aba === 'comissoes' && funcionarioComissoes && (
              <SePermitido permissao="regulatorio-qualidade.funcionarios.criar">
                <Button type="button" onClick={() => setCriandoComissao(true)}>
                  <PlusIcon aria-hidden />
                  Nova Comissão
                </Button>
              </SePermitido>
            )}
          </>
        }
      />
      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="funcionarios">Funcionarios</TabsTrigger>
          <TabsTrigger value="cargos">Cargos</TabsTrigger>
          <TabsTrigger value="comissoes">Comissoes</TabsTrigger>
        </TabsList>
        <TabsContent value="funcionarios">
          <AbaFuncionarios
            onVerComissoes={abrirComissoes}
            criando={criandoFuncionario}
            onFecharCriando={() => setCriandoFuncionario(false)}
          />
        </TabsContent>
        <TabsContent value="cargos">
          <AbaCargos criando={criandoCargo} onFecharCriando={() => setCriandoCargo(false)} />
        </TabsContent>
        <TabsContent value="comissoes">
          <AbaComissoes
            funcionario={funcionarioComissoes}
            criando={criandoComissao}
            onFecharCriando={() => setCriandoComissao(false)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface AbaFuncionariosProps {
  onVerComissoes: (f: Funcionario) => void;
  criando: boolean;
  onFecharCriando: () => void;
}

function AbaFuncionarios({
  onVerComissoes,
  criando,
  onFecharCriando,
}: Readonly<AbaFuncionariosProps>) {
  const [editando, setEditando] = useState<Funcionario | null>(null);
  const [desativando, setDesativando] = useState<Funcionario | null>(null);
  const [excluindo, setExcluindo] = useState<Funcionario | null>(null);
  const desativar = useDesativarFuncionario();
  const excluir = useExcluirFuncionario();

  const EXPORTACAO: ExportacaoGrid = {
    permissao: 'regulatorio-qualidade.funcionarios.exportar',
    nomeArquivo: 'funcionarios',
    schema: exportFuncionariosQuerySchema,
  };

  const COLUNAS: ColunaGrid<Funcionario>[] = [
    { id: 'nome', titulo: 'Nome', ordenavel: true, exportavel: true, ocultavel: false },
    { id: 'cargoNome', titulo: 'Cargo', exportavel: 'cargo', celula: (f) => f.cargoNome ?? '-' },
    {
      id: 'departamento',
      titulo: 'Departamento',
      exportavel: true,
      celula: (f) => f.departamento ?? '-',
    },
    {
      id: 'telefone',
      titulo: 'Telefone',
      ordenavel: true,
      exportavel: true,
      celula: (f) => (f.telefone ? formatarMascara('telefone', f.telefone) : '-'),
    },
    {
      id: 'tipoContrato',
      titulo: 'Tipo Contrato',
      ordenavel: true,
      exportavel: true,
      celula: (f) => (f.tipoContrato ? FUNCIONARIO_TIPO_CONTRATO_ROTULOS[f.tipoContrato] : '-'),
    },
    {
      id: 'salario',
      titulo: 'Salario',
      ordenavel: true,
      exportavel: true,
      celula: (f) => moeda(f.salario),
    },
    {
      id: 'status',
      titulo: 'Status',
      ordenavel: true,
      exportavel: true,
      celula: (f) => <StatusAtivo ativo={f.ativo} />,
    },
  ];

  return (
    <div className="grid gap-4">
      <DataGrid
        url={URL_FUNCIONARIOS}
        schema={funcionarioPageSchema}
        querySchema={listFuncionariosQuerySchema}
        colunas={COLUNAS}
        busca="Buscar funcionarios..."
        status={STATUS}
        exportacao={EXPORTACAO}
        mensagemVazio="Nenhum funcionario encontrado."
        acoes={(funcionario) => [
          {
            rotulo: 'Editar',
            icone: PencilIcon,
            permissao: 'regulatorio-qualidade.funcionarios.editar',
            onSelect: () => setEditando(funcionario),
          },
          {
            rotulo: 'Comissoes',
            icone: DollarSignIcon,
            permissao: 'regulatorio-qualidade.funcionarios.ver',
            onSelect: () => onVerComissoes(funcionario),
          },
          {
            rotulo: 'Desativar',
            icone: PowerIcon,
            permissao: 'regulatorio-qualidade.funcionarios.editar',
            desabilitada: !funcionario.ativo,
            onSelect: () => setDesativando(funcionario),
          },
          {
            rotulo: 'Excluir',
            icone: Trash2Icon,
            destrutiva: true,
            permissao: 'regulatorio-qualidade.funcionarios.excluir',
            onSelect: () => setExcluindo(funcionario),
          },
        ]}
      />
      {criando && <ModalFuncionario onFechar={onFecharCriando} />}
      {editando && <ModalFuncionario funcionario={editando} onFechar={() => setEditando(null)} />}
      <ConfirmDialog
        aberto={desativando !== null}
        onAbertoChange={(aberto) => aberto || setDesativando(null)}
        titulo="Desativar Funcionario"
        descricao={`Tem certeza que deseja desativar o funcionario "${desativando?.nome ?? ''}"?`}
        rotuloConfirmar="Desativar"
        destrutivo={false}
        onConfirmar={() => (desativando ? desativar.mutateAsync(desativando) : undefined)}
      />
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir Funcionario"
        descricao={`Tem certeza que deseja excluir o funcionario "${excluindo?.nome ?? ''}"? Esta ação não pode ser desfeita.`}
        rotuloConfirmar="Excluir"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}

interface AbaCargosProps {
  criando: boolean;
  onFecharCriando: () => void;
}

function AbaCargos({ criando, onFecharCriando }: Readonly<AbaCargosProps>) {
  const [editando, setEditando] = useState<Cargo | null>(null);
  const [excluindo, setExcluindo] = useState<Cargo | null>(null);
  const excluir = useExcluirCargo();

  const EXPORTACAO: ExportacaoGrid = {
    permissao: 'regulatorio-qualidade.funcionarios.exportar',
    nomeArquivo: 'cargos',
    schema: exportCargosQuerySchema,
  };

  const COLUNAS: ColunaGrid<Cargo>[] = [
    { id: 'nome', titulo: 'Nome', ordenavel: true, exportavel: true, ocultavel: false },
    {
      id: 'departamento',
      titulo: 'Departamento',
      ordenavel: true,
      exportavel: true,
      celula: (c) => c.departamento ?? '-',
    },
    { id: 'descricao', titulo: 'Descricao', exportavel: true, celula: (c) => c.descricao ?? '-' },
    {
      id: 'salarioBase',
      titulo: 'Salario Base',
      ordenavel: true,
      exportavel: true,
      celula: (c) => moeda(c.salarioBase),
    },
  ];

  return (
    <div className="grid gap-4">
      <DataGrid
        url={URL_CARGOS}
        schema={cargoPageSchema}
        querySchema={listCargosQuerySchema}
        colunas={COLUNAS}
        busca="Buscar cargos..."
        status={STATUS}
        exportacao={EXPORTACAO}
        mensagemVazio="Nenhum cargo encontrado."
        acoes={(cargo) => [
          {
            rotulo: 'Editar',
            icone: PencilIcon,
            permissao: 'regulatorio-qualidade.funcionarios.editar',
            onSelect: () => setEditando(cargo),
          },
          {
            rotulo: 'Excluir',
            icone: Trash2Icon,
            destrutiva: true,
            permissao: 'regulatorio-qualidade.funcionarios.excluir',
            onSelect: () => setExcluindo(cargo),
          },
        ]}
      />
      {criando && <ModalCargo onFechar={onFecharCriando} />}
      {editando && <ModalCargo cargo={editando} onFechar={() => setEditando(null)} />}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir Cargo"
        descricao={`Tem certeza que deseja excluir o cargo "${excluindo?.nome ?? ''}"? Esta ação não pode ser desfeita.`}
        rotuloConfirmar="Excluir"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}

interface AbaComissoesProps {
  funcionario: Funcionario | null;
  criando: boolean;
  onFecharCriando: () => void;
}

function AbaComissoes({ funcionario, criando, onFecharCriando }: Readonly<AbaComissoesProps>) {
  const [editando, setEditando] = useState<Comissao | null>(null);
  const [excluindo, setExcluindo] = useState<Comissao | null>(null);
  const excluir = useExcluirComissao(funcionario?.id ?? '');

  if (!funcionario) {
    return (
      <EmptyState
        icone={DollarSignIcon}
        titulo='Selecione um funcionario na aba "Funcionarios" para visualizar suas comissoes.'
        descricao='Use o menu de acoes (tres pontos) e clique em "Comissoes".'
      />
    );
  }

  const COLUNAS: ColunaGrid<Comissao>[] = [
    {
      id: 'dataReferencia',
      titulo: 'Data de Referência',
      ordenavel: true,
      ocultavel: false,
      celula: (c) => formatarData(c.dataReferencia),
    },
    {
      id: 'valor',
      titulo: 'Valor',
      ordenavel: true,
      celula: (c) => moeda(c.valor),
    },
    { id: 'descricao', titulo: 'Descrição', celula: (c) => c.descricao ?? '-' },
    {
      id: 'status',
      titulo: 'Status',
      ordenavel: true,
      celula: (c) => (
        <StatusBadge tom={c.status === 'paga' ? 'sucesso' : 'alerta'}>
          {c.status === 'paga' ? 'Paga' : 'Pendente'}
        </StatusBadge>
      ),
    },
  ];

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Comissões de <span className="font-medium text-foreground">{funcionario.nome}</span>
      </p>
      <DataGrid
        key={funcionario.id}
        url={urlComissoes(funcionario.id)}
        schema={comissaoPageSchema}
        querySchema={listComissoesQuerySchema}
        colunas={COLUNAS}
        busca={false}
        mensagemVazio="Nenhuma comissão lançada."
        acoes={(comissao) => [
          {
            rotulo: 'Editar',
            icone: PencilIcon,
            permissao: 'regulatorio-qualidade.funcionarios.editar',
            onSelect: () => setEditando(comissao),
          },
          {
            rotulo: 'Excluir',
            icone: Trash2Icon,
            destrutiva: true,
            permissao: 'regulatorio-qualidade.funcionarios.excluir',
            onSelect: () => setExcluindo(comissao),
          },
        ]}
      />
      {criando && <ModalComissao funcionarioId={funcionario.id} onFechar={onFecharCriando} />}
      {editando && (
        <ModalComissao
          funcionarioId={funcionario.id}
          comissao={editando}
          onFechar={() => setEditando(null)}
        />
      )}
      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => aberto || setExcluindo(null)}
        titulo="Excluir Comissão"
        descricao="Tem certeza que deseja excluir esta comissão? Esta ação não pode ser desfeita."
        rotuloConfirmar="Excluir"
        onConfirmar={() => (excluindo ? excluir.mutateAsync(excluindo.id) : undefined)}
      />
    </div>
  );
}
