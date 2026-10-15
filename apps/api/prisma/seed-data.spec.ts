import { buildSeedData, gerarCnpj, SEED_EMAIL_DOMAIN } from './seed-data';

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
  const data = buildSeedData();
  const pessoas = [data.empresa, ...data.usuarios, data.admin];

  it('é determinístico (mesma semente, mesmos dados e ids)', () => {
    expect(buildSeedData()).toEqual(data);
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
});
