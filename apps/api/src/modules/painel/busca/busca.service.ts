import { Injectable } from '@nestjs/common';
import {
  BUSCA_LIMITE_POR_TIPO,
  PERMISSAO_BUSCA,
  TIPOS_BUSCA,
  type BuscaGlobalQuery,
  type BuscaGlobalResponse,
  type GrupoBusca,
  type ItemBusca,
  type TipoBusca,
} from '@torres/shared';
import { EscopoDadosService } from '../../../common/auth/escopo-dados.service';
import type { UsuarioAutenticado } from '../../../common/auth/usuario-autenticado';
import { PacientesService } from '../../comercial-atendimento/pacientes/pacientes.service';
import { NegociosService } from '../../comercial-atendimento/pipeline/negocios.service';
import { FornecedoresService } from '../../compras-estoque/fornecedores/fornecedores.service';
import { ProfissionaisService } from '../../gestao-profissionais/profissionais/profissionais.service';
import { ContratosSalaService } from '../../gestao-profissionais/salas/contratos-sala.service';

/**
 * Busca global do ⌘K (issue #159). Consulta cada módulo dono pelo service exportado, só dos tipos
 * que o usuário pode ver (permissão da tela de origem) e dentro do escopo de dados dele.
 *
 * O termo pesquisado pode ser dado pessoal (nome, CPF, telefone): este service nunca o registra
 * em log. A busca é leitura e não grava `audit_log`.
 */
@Injectable()
export class BuscaService {
  constructor(
    private readonly escopo: EscopoDadosService,
    private readonly pacientes: PacientesService,
    private readonly profissionais: ProfissionaisService,
    private readonly contratos: ContratosSalaService,
    private readonly fornecedores: FornecedoresService,
    private readonly negocios: NegociosService,
  ) {}

  async buscar(usuario: UsuarioAutenticado, query: BuscaGlobalQuery): Promise<BuscaGlobalResponse> {
    const termo = query.q;
    const tipos = TIPOS_BUSCA.filter((tipo) => this.visivel(usuario, tipo));
    const itens = await Promise.all(tipos.map((tipo) => this.buscarTipo(tipo, termo)));
    const grupos: GrupoBusca[] = tipos.map((tipo, i) => ({ tipo, itens: itens[i]! }));
    return { grupos: grupos.filter((g) => g.itens.length > 0) };
  }

  /**
   * Permissão da tela de origem. Leads (negócios) misturam contatos de qualquer profissional e
   * não têm escopo próprio: perfil restrito não os vê.
   */
  private visivel(usuario: UsuarioAutenticado, tipo: TipoBusca): boolean {
    if (!usuario.permissoes.has(PERMISSAO_BUSCA[tipo])) return false;
    return !(tipo === 'LEAD' && this.escopo.restrito());
  }

  private buscarTipo(tipo: TipoBusca, termo: string): Promise<ItemBusca[]> {
    const limite = BUSCA_LIMITE_POR_TIPO;
    switch (tipo) {
      case 'PACIENTE':
        return this.pacientes.buscaGlobal(termo, limite);
      case 'PROFISSIONAL':
        return this.profissionais.buscaGlobal(termo, limite, this.escopo.profissionalIds());
      case 'CONTRATO':
        return this.contratos.buscaGlobal(termo, limite);
      case 'FORNECEDOR':
        return this.fornecedores.buscaGlobal(termo, limite);
      case 'LEAD':
        return this.negocios.buscaGlobal(termo, limite);
    }
  }
}
