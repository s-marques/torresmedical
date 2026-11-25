import { PERMISSAO_BUSCA, type ItemBusca, type TipoBusca } from '@torres/shared';
import { escopoFalso } from '../../../../test/utils/escopo-falso';
import type { UsuarioAutenticado } from '../../../common/auth/usuario-autenticado';
import { BuscaService } from './busca.service';

function item(titulo: string): ItemBusca {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    titulo,
    descricao: null,
    rota: '/x',
  };
}

function usuario(tipos: readonly TipoBusca[]): UsuarioAutenticado {
  return {
    permissoes: new Set(tipos.map((t) => PERMISSAO_BUSCA[t])),
  } as unknown as UsuarioAutenticado;
}

const TODOS: readonly TipoBusca[] = ['PACIENTE', 'PROFISSIONAL', 'CONTRATO', 'FORNECEDOR', 'LEAD'];

function criar(escopo = escopoFalso()) {
  const pacientes = { buscaGlobal: jest.fn(async () => [item('Paciente')]) };
  const profissionais = { buscaGlobal: jest.fn(async () => [item('Profissional')]) };
  const contratos = { buscaGlobal: jest.fn(async () => [item('Contrato')]) };
  const fornecedores = { buscaGlobal: jest.fn(async () => [] as ItemBusca[]) };
  const negocios = { buscaGlobal: jest.fn(async () => [item('Lead')]) };
  const service = new BuscaService(
    escopo as never,
    pacientes as never,
    profissionais as never,
    contratos as never,
    fornecedores as never,
    negocios as never,
  );
  return { service, pacientes, profissionais, contratos, fornecedores, negocios };
}

describe('BuscaService', () => {
  it('consulta só os tipos permitidos, com o limite por tipo, e omite grupos vazios', async () => {
    const { service, pacientes, profissionais, fornecedores, contratos } = criar();

    const r = await service.buscar(usuario(['PACIENTE', 'PROFISSIONAL', 'FORNECEDOR']), {
      q: 'ana',
    });

    expect(r.grupos.map((g) => g.tipo)).toEqual(['PACIENTE', 'PROFISSIONAL']);
    expect(pacientes.buscaGlobal).toHaveBeenCalledWith('ana', 5);
    expect(profissionais.buscaGlobal).toHaveBeenCalledWith('ana', 5, null);
    expect(fornecedores.buscaGlobal).toHaveBeenCalledWith('ana', 5);
    expect(contratos.buscaGlobal).not.toHaveBeenCalled();
  });

  it('sem nenhuma permissão de tela devolve vazio e não consulta nada', async () => {
    const { service, pacientes } = criar();
    expect(await service.buscar(usuario([]), { q: 'ana' })).toEqual({ grupos: [] });
    expect(pacientes.buscaGlobal).not.toHaveBeenCalled();
  });

  it('perfil restrito passa os profissionais do escopo e não busca leads', async () => {
    const { service, profissionais, negocios } = criar(escopoFalso(['p1']));

    const r = await service.buscar(usuario(TODOS), { q: 'ana' });

    expect(profissionais.buscaGlobal).toHaveBeenCalledWith('ana', 5, ['p1']);
    expect(negocios.buscaGlobal).not.toHaveBeenCalled();
    expect(r.grupos.map((g) => g.tipo)).not.toContain('LEAD');
  });

  it('sem restrição inclui os leads', async () => {
    const { service } = criar();
    const r = await service.buscar(usuario(TODOS), { q: 'ana' });
    expect(r.grupos.map((g) => g.tipo)).toEqual(['PACIENTE', 'PROFISSIONAL', 'CONTRATO', 'LEAD']);
  });
});
