-- Use 건반 as the persisted gig session label and keep one row per linked
-- member in each gig. The DO block is one transaction, including FK transfers.
DO $migration$
BEGIN
  UPDATE public.users
  SET part = replace(part, '키보드', '건반')
  WHERE part LIKE '%키보드%';

  UPDATE public.gig_rsvps
  SET part = replace(part, '키보드', '건반')
  WHERE part LIKE '%키보드%';

  UPDATE public.performers
  SET part = replace(part, '키보드', '건반')
  WHERE part LIKE '%키보드%';

  UPDATE public.nomination_responses
  SET session_part = replace(session_part, '키보드', '건반')
  WHERE session_part LIKE '%키보드%';

  UPDATE public.nominations
  SET required_parts = ARRAY(
    SELECT replace(item.part, '키보드', '건반')
    FROM unnest(required_parts) AS item(part)
  )
  WHERE array_to_string(required_parts, ',') LIKE '%키보드%';

  UPDATE public.setlists
  SET required_parts = ARRAY(
    SELECT replace(item.part, '키보드', '건반')
    FROM unnest(required_parts) AS item(part)
  )
  WHERE array_to_string(required_parts, ',') LIKE '%키보드%';

  UPDATE public.nominations
  SET recommended_vocals = replace(recommended_vocals::text, '키보드', '건반')::jsonb
  WHERE recommended_vocals::text LIKE '%키보드%';

  UPDATE public.setlists
  SET recommended_vocals = replace(recommended_vocals::text, '키보드', '건반')::jsonb
  WHERE recommended_vocals::text LIKE '%키보드%';

  UPDATE public.setlists
  SET session_members = replace(session_members, '키보드', '건반')
  WHERE session_members LIKE '%키보드%';

  CREATE TEMP TABLE performer_merges AS
  SELECT id AS duplicate_id, keep_id
  FROM (
    SELECT id, min(id) OVER (PARTITION BY gig_id, user_id) AS keep_id
    FROM public.performers
    WHERE user_id IS NOT NULL
  ) ranked
  WHERE id <> keep_id;

  -- Preserve all assigned sessions once, in original row and token order.
  WITH members AS (
    SELECT DISTINCT keep_id, keep_id AS member_id FROM performer_merges
    UNION ALL
    SELECT keep_id, duplicate_id AS member_id FROM performer_merges
  ), tokens AS (
    SELECT m.keep_id, m.member_id, t.ord, btrim(t.part) AS part
    FROM members m
    JOIN public.performers p ON p.id = m.member_id
    CROSS JOIN LATERAL unnest(string_to_array(p.part, ',')) WITH ORDINALITY AS t(part, ord)
  ), first_tokens AS (
    SELECT DISTINCT ON (keep_id, part) keep_id, member_id, ord, part
    FROM tokens
    WHERE part <> ''
    ORDER BY keep_id, part, member_id, ord
  ), merged AS (
    SELECT keep_id, string_agg(part, ', ' ORDER BY member_id, ord) AS part
    FROM first_tokens
    GROUP BY keep_id
  )
  UPDATE public.performers p
  SET part = merged.part
  FROM merged
  WHERE p.id = merged.keep_id;

  UPDATE public.performers p
  SET name = COALESCE(
        NULLIF(p.name, ''),
        (SELECT d.name FROM performer_merges m JOIN public.performers d ON d.id = m.duplicate_id
         WHERE m.keep_id = p.id AND NULLIF(d.name, '') IS NOT NULL ORDER BY d.id LIMIT 1)
      ),
      photo_url = COALESCE(
        p.photo_url,
        (SELECT d.photo_url FROM performer_merges m JOIN public.performers d ON d.id = m.duplicate_id
         WHERE m.keep_id = p.id AND d.photo_url IS NOT NULL ORDER BY d.id LIMIT 1)
      )
  WHERE p.id IN (SELECT keep_id FROM performer_merges);

  UPDATE public.nominations n
  SET created_by = m.keep_id
  FROM performer_merges m
  WHERE n.created_by = m.duplicate_id;

  UPDATE public.setlists s
  SET created_by = m.keep_id
  FROM performer_merges m
  WHERE s.created_by = m.duplicate_id;

  DELETE FROM public.performers p
  USING performer_merges m
  WHERE p.id = m.duplicate_id;

  DROP TABLE performer_merges;

  CREATE UNIQUE INDEX IF NOT EXISTS performers_gig_user_unique
  ON public.performers (gig_id, user_id)
  WHERE user_id IS NOT NULL;
END
$migration$;
