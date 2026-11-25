-- Assinatura do atendimento (issue #151): permissão extra "prontuarios.assinar" para os perfis
-- padrão Médico e Administrador. Idempotente; só acrescenta, nunca remove.
INSERT INTO "perfis_permissoes" ("perfil_id", "permissao")
SELECT p."id", v."permissao"
FROM "perfis" p
JOIN (VALUES
  ('Administrador', 'consultorio-assistencial.prontuarios.assinar'),
  ('Médico', 'consultorio-assistencial.prontuarios.assinar')
) AS v("nome", "permissao") ON v."nome" = p."nome"
WHERE p."padrao" = true
ON CONFLICT DO NOTHING;
