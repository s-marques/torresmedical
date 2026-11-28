-- Tela Metas (issue #172): permissões "comercial-atendimento.metas.*" para os perfis padrão.
-- Administrador: tudo. Gerência: ver e exportar. Comercial: ver. Idempotente; só acrescenta.
INSERT INTO "perfis_permissoes" ("perfil_id", "permissao")
SELECT p."id", v."permissao"
FROM "perfis" p
JOIN (VALUES
  ('Administrador', 'comercial-atendimento.metas.ver'),
  ('Administrador', 'comercial-atendimento.metas.criar'),
  ('Administrador', 'comercial-atendimento.metas.editar'),
  ('Administrador', 'comercial-atendimento.metas.excluir'),
  ('Administrador', 'comercial-atendimento.metas.exportar'),
  ('Gerência', 'comercial-atendimento.metas.ver'),
  ('Gerência', 'comercial-atendimento.metas.exportar'),
  ('Comercial', 'comercial-atendimento.metas.ver')
) AS v("nome", "permissao") ON v."nome" = p."nome"
WHERE p."padrao" = true
ON CONFLICT DO NOTHING;
