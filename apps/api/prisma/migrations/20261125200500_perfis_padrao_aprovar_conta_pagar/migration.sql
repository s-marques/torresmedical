-- Aprovação de conta a pagar (issue #164): permissão extra "contas-pagar.aprovar" para os perfis
-- padrão Administrador e Gerência. O Financeiro lança e dá baixa, mas não aprova. Idempotente; só
-- acrescenta, nunca remove.
INSERT INTO "perfis_permissoes" ("perfil_id", "permissao")
SELECT p."id", v."permissao"
FROM "perfis" p
JOIN (VALUES
  ('Administrador', 'financeiro.contas-pagar.aprovar'),
  ('Gerência', 'financeiro.contas-pagar.aprovar')
) AS v("nome", "permissao") ON v."nome" = p."nome"
WHERE p."padrao" = true
ON CONFLICT DO NOTHING;
