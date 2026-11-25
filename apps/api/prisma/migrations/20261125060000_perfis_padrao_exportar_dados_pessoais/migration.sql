-- Controle de exportação (issue #156): exportar dados pessoais ou clínicos exige a permissão extra
-- "dados-pessoais.exportar", além de <tela>.exportar. Os perfis padrão que já exportavam cadastros de
-- pessoas (Administrador, Gerência e Financeiro) continuam podendo. Idempotente; só acrescenta.
INSERT INTO "perfis_permissoes" ("perfil_id", "permissao")
SELECT p."id", v."permissao"
FROM "perfis" p
JOIN (VALUES
  ('Administrador', 'configuracoes-gestao.dados-pessoais.exportar'),
  ('Gerência', 'configuracoes-gestao.dados-pessoais.exportar'),
  ('Financeiro', 'configuracoes-gestao.dados-pessoais.exportar')
) AS v("nome", "permissao") ON v."nome" = p."nome"
WHERE p."padrao" = true
ON CONFLICT DO NOTHING;
