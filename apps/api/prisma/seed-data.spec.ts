import { buildSeedData, gerarCnpj, SEED_EMAIL_DOMAIN } from './seed-data';
import { gerarCpf } from './seed-entidades';

function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf)) return false;
  const calc = (base: string): number => {
    const soma = [...base].reduce((acc, n, i) => acc + Number(n) * (base.length + 1 - i), 0);
    const resto = 11 - (soma % 11);
    return resto >= 10 ? 0 : resto;
  };
  const d1 = calc(cpf.slice(0, 9));
  return cpf.endsWith(`${d1}${calc(cpf.slice(0, 9) + d1)}`);
}

function cnpjValido(cnpj: string): boolean {
  if (!/^\d{14}$/.test(cnpj)) return false;
  const calc = (base: string): number => {
    const pesos =
      base.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = [...base].reduce((acc, n, i) => acc + Number(n) * (pesos[i] ?? 0), 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = calc(cnpj.slice(0, 12));
  const d2 = calc(cnpj.slice(0, 12) + d1);
  return cnpj.endsWith(`${d1}${d2}`);
}

describe('buildSeedData', () => {
  const agora = new Date('2026-10-15T12:00:00.000Z');
  const data = buildSeedData(agora);
  const pessoas = [data.empresa, ...data.usuarios, data.admin];

  it('é determinístico (mesma semente, mesmos dados e ids)', () => {
    expect(buildSeedData(agora)).toEqual(data);
  });

  it('usa somente e-mails do domínio reservado para exemplos', () => {
    for (const { email } of pessoas) {
      expect(email.endsWith(`@${SEED_EMAIL_DOMAIN}`)).toBe(true);
    }
  });

  it('gera e-mails e ids únicos', () => {
    const emails = [...data.usuarios, data.admin].map((u) => u.email);
    const ids = [
      data.empresa,
      ...data.unidades,
      ...data.usuarios,
      data.perfilAdmin,
      data.admin,
    ].map((r) => r.id);
    expect(new Set(emails).size).toBe(emails.length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gera telefones fictícios no formato DDD + celular, só com dígitos', () => {
    for (const { telefone } of pessoas) {
      expect(telefone).toMatch(/^[1-9]{2}9\d{8}$/);
    }
  });

  it('gera CNPJ fictício com dígitos verificadores válidos', () => {
    expect(cnpjValido(data.empresa.documento)).toBe(true);
    for (let i = 0; i < 20; i++) expect(cnpjValido(gerarCnpj())).toBe(true);
  });

  it('liga unidades e usuários à empresa do seed', () => {
    expect(data.unidades.length).toBeGreaterThan(0);
    expect(data.usuarios.length).toBeGreaterThan(0);
    for (const r of [...data.unidades, ...data.usuarios]) {
      expect(r.empresaId).toBe(data.empresa.id);
    }
  });

  it('cria o admin admin@example.com com o perfil Administrador', () => {
    expect(data.admin).toMatchObject({
      email: 'admin@example.com',
      perfilId: data.perfilAdmin.id,
      empresaId: data.empresa.id,
    });
    expect(data.perfilAdmin.nome).toBe('Administrador');
  });

  describe('entidades compartilhadas', () => {
    const { entidades } = data;
    const todas = [...Object.values(entidades), ...Object.values(data.whatsapp)].flat();

    it('gera ids únicos, sem repetir os dos demais dados', () => {
      const ids = [data.empresa.id, data.admin.id, ...todas.map((r) => r.id)];
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('gera CPF fictício válido para os pacientes', () => {
      expect(entidades.pacientes.length).toBeGreaterThanOrEqual(20);
      for (const { documento } of entidades.pacientes)
        expect(cpfValido(String(documento))).toBe(true);
      for (let i = 0; i < 20; i++) expect(cpfValido(gerarCpf())).toBe(true);
    });

    it('usa e-mails do domínio de exemplos e telefones fictícios', () => {
      const pessoas = [
        ...entidades.pacientes,
        ...entidades.profissionais,
        ...entidades.funcionarios,
      ];
      for (const { email, telefone } of pessoas) {
        expect(email?.endsWith(`@${SEED_EMAIL_DOMAIN}`)).toBe(true);
        expect(telefone).toMatch(/^[1-9]{2}9\d{8}$/);
      }
    });

    it('liga as FKs a registros do próprio seed e tem ativos e inativos', () => {
      const ids = (lista: { id: string }[]) => new Set(lista.map((r) => r.id));
      const especialidades = ids(entidades.especialidades);
      const cargos = ids(entidades.cargos);
      const categorias = ids(entidades.categorias);
      expect(
        entidades.profissionais.every((p) => especialidades.has(String(p.especialidadeId))),
      ).toBe(true);
      expect(entidades.funcionarios.every((f) => cargos.has(String(f.cargoId)))).toBe(true);
      expect(entidades.produtos.every((p) => categorias.has(String(p.categoriaId)))).toBe(true);
      expect(entidades.pacientes.some((p) => p.status === 'INATIVO')).toBe(true);
      expect(entidades.produtos.map((p) => p.tipo)).toEqual(
        expect.arrayContaining(['PRODUTO', 'SERVICO']),
      );
    });
  });

  describe('atendimento WhatsApp', () => {
    const { whatsapp, entidades } = data;

    it('liga contatos a pacientes do seed e conversas a canais e contatos do seed', () => {
      const ids = (lista: { id: string }[]) => new Set(lista.map((r) => r.id));
      const pacientes = ids(entidades.pacientes);
      const canais = ids(whatsapp.canaisWhatsapp);
      const contatos = ids(whatsapp.contatosWhatsapp);
      const conversas = ids(whatsapp.conversasWhatsapp);
      const vinculados = whatsapp.contatosWhatsapp.filter((c) => c.pacienteId);
      expect(vinculados.length).toBeGreaterThan(0);
      expect(vinculados.every((c) => pacientes.has(String(c.pacienteId)))).toBe(true);
      expect(whatsapp.conversasWhatsapp.every((c) => canais.has(c.canalId))).toBe(true);
      expect(whatsapp.conversasWhatsapp.every((c) => contatos.has(c.contatoId))).toBe(true);
      expect(whatsapp.mensagensWhatsapp.every((m) => conversas.has(m.conversaId))).toBe(true);
    });

    it('tem conversas em todos os status e telefones únicos com DDI 55', () => {
      expect(new Set(whatsapp.conversasWhatsapp.map((c) => c.status))).toEqual(
        new Set(['BOT', 'AGUARDANDO', 'EM_ATENDIMENTO', 'FINALIZADA']),
      );
      const telefones = whatsapp.contatosWhatsapp.map((c) => c.telefone);
      expect(new Set(telefones).size).toBe(telefones.length);
      for (const telefone of telefones) expect(telefone).toMatch(/^55[1-9]{2}9\d{8}$/);
    });
  });
});
