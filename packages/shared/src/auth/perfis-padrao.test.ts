import { describe, expect, it } from 'vitest';
import { isPermissao, PERMISSOES } from './permissoes';
import {
  PERFIL_ADMINISTRADOR,
  PERFIL_MEDICO,
  PERFIS_PADRAO,
  PERFIS_SEM_ACESSO_CLINICO,
  PERMISSOES_CLINICAS,
  permissoesDoPerfilPadrao,
  telasSemPerfilPadrao,
} from './perfis-padrao';

describe('perfis de acesso padrão', () => {
  it('são os 6 perfis do requisito, com nomes únicos', () => {
    expect(PERFIS_PADRAO.map((perfil) => perfil.nome)).toEqual([
      'Administrador',
      'Gerência',
      'Recepção',
      'Médico',
      'Financeiro',
      'Comercial',
    ]);
  });

  it('só concedem permissões do catálogo, sem repetição', () => {
    for (const perfil of PERFIS_PADRAO) {
      const permissoes = permissoesDoPerfilPadrao(perfil);
      expect(permissoes.every((permissao) => isPermissao(permissao))).toBe(true);
      expect(new Set(permissoes).size).toBe(permissoes.length);
    }
  });

  it('o Administrador recebe todo o catálogo', () => {
    const admin = PERFIS_PADRAO.find((perfil) => perfil.nome === PERFIL_ADMINISTRADOR);
    expect(permissoesDoPerfilPadrao(admin!)).toEqual([...PERMISSOES]);
  });

  it.each(PERFIS_SEM_ACESSO_CLINICO)('%s não tem nenhuma permissão clínica', (nome) => {
    const perfil = PERFIS_PADRAO.find((item) => item.nome === nome)!;
    const clinicas = permissoesDoPerfilPadrao(perfil).filter((permissao) =>
      PERMISSOES_CLINICAS.includes(permissao),
    );
    expect(clinicas).toEqual([]);
  });

  it('só o Administrador consulta o audit_log e o log de acesso ao prontuário', () => {
    for (const perfil of PERFIS_PADRAO.filter((item) => item.nome !== PERFIL_ADMINISTRADOR)) {
      const permissoes = permissoesDoPerfilPadrao(perfil);
      expect(permissoes).not.toContain('configuracoes-gestao.auditoria.ver');
      expect(permissoes).not.toContain('consultorio-assistencial.prontuarios-acessos.ver');
    }
  });

  it('o Médico vê só os profissionais vinculados; os demais, todos', () => {
    for (const perfil of PERFIS_PADRAO) {
      expect(perfil.escopoDados).toBe(
        perfil.nome === PERFIL_MEDICO ? 'PROFISSIONAIS_VINCULADOS' : 'TODOS',
      );
    }
  });

  it('toda tela do menu declara a quais perfis padrão pertence', () => {
    // Falha ao criar uma tela nova sem listá-la em `perfis-padrao.ts`.
    expect(telasSemPerfilPadrao()).toEqual([]);
  });
});
