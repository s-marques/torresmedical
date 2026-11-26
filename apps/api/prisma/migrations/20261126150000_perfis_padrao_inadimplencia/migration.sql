-- Tela Inadimplência (issue #166): permissões "financeiro.inadimplencia.*" para os perfis padrão.
-- Administrador e Financeiro: tudo (inclui editar a régua). Gerência: ver e exportar. Idempotente;
-- só acrescenta, nunca remove.
INSERT INTO "perfis_permissoes" ("perfil_id", "permissao")
SELECT p."id", v."permissao"
FROM "perfis" p
JOIN (VALUES
  ('Administrador', 'financeiro.inadimplencia.ver'),
  ('Administrador', 'financeiro.inadimplencia.criar'),
  ('Administrador', 'financeiro.inadimplencia.editar'),
  ('Administrador', 'financeiro.inadimplencia.excluir'),
  ('Administrador', 'financeiro.inadimplencia.exportar'),
  ('Gerência', 'financeiro.inadimplencia.ver'),
  ('Gerência', 'financeiro.inadimplencia.exportar'),
  ('Financeiro', 'financeiro.inadimplencia.ver'),
  ('Financeiro', 'financeiro.inadimplencia.criar'),
  ('Financeiro', 'financeiro.inadimplencia.editar'),
  ('Financeiro', 'financeiro.inadimplencia.excluir'),
  ('Financeiro', 'financeiro.inadimplencia.exportar')
) AS v("nome", "permissao") ON v."nome" = p."nome"
WHERE p."padrao" = true
ON CONFLICT DO NOTHING;
