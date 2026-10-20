-- Read-only catalog audit. No member rows, tokens or credentials are returned.
BEGIN READ ONLY;
SELECT jsonb_build_object(
  'schema_access', (SELECT jsonb_agg(jsonb_build_object(
    'role_name', r.role_name, 'can_use_public', has_schema_privilege(r.role_name, 'public', 'USAGE')))
    FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role_name)),
  'tables', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.table_name, t.role_name) FROM (
    SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, r.role_name,
      has_table_privilege(r.role_name, c.oid, 'SELECT') AS can_select,
      has_table_privilege(r.role_name, c.oid, 'INSERT') AS can_insert,
      has_table_privilege(r.role_name, c.oid, 'UPDATE') AS can_update,
      has_table_privilege(r.role_name, c.oid, 'DELETE') AS can_delete,
      c.relacl::text AS acl
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(role_name)
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  ) t),
  'defaults', (SELECT jsonb_agg(to_jsonb(t)) FROM (
    SELECT pg_get_userbyid(d.defaclrole) AS creator_role,
      COALESCE(n.nspname, '(all schemas)') AS schema_name,
      d.defaclobjtype AS object_type, d.defaclacl::text AS default_acl
    FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
    WHERE d.defaclnamespace = 0 OR n.nspname = 'public'
  ) t),
  'functions', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.function_name, t.arguments) FROM (
    SELECT p.proname AS function_name, pg_get_function_identity_arguments(p.oid) AS arguments,
      p.prosecdef AS security_definer, p.proacl::text AS acl,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
      has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
  ) t),
  'sequences', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.sequence_name) FROM (
    SELECT c.relname AS sequence_name, c.relacl::text AS acl,
      has_sequence_privilege('anon', c.oid, 'USAGE') AS anon_usage,
      has_sequence_privilege('authenticated', c.oid, 'USAGE') AS authenticated_usage,
      has_sequence_privilege('service_role', c.oid, 'USAGE') AS service_role_usage
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S'
  ) t),
  'policies', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.tablename, t.policyname) FROM (
    SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies WHERE schemaname = 'public'
  ) t)
) AS audit;
COMMIT;
