BEGIN;

CREATE TABLE public.user_legal_consents (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_kind text NOT NULL CHECK (document_kind IN ('terms', 'privacy')),
  document_version text NOT NULL CHECK (length(document_version) BETWEEN 1 AND 100),
  document_hash text NOT NULL CHECK (document_hash ~ '^[0-9a-f]{64}$'),
  document_title text NOT NULL CHECK (length(document_title) > 0),
  document_content text NOT NULL CHECK (length(document_content) > 0),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, document_kind, document_version, document_hash)
);

ALTER TABLE public.user_legal_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own legal consent history" ON public.user_legal_consents
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- Verified server actions append immutable snapshots. Browsers cannot forge,
-- backdate, update or delete records directly through the Data API.
REVOKE ALL ON TABLE public.user_legal_consents FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.user_legal_consents TO authenticated;
GRANT SELECT, INSERT ON TABLE public.user_legal_consents TO service_role;

COMMENT ON TABLE public.user_legal_consents IS
  'Append-only acceptance snapshots for published service terms and privacy notices; drafts are never recorded.';

COMMIT;
