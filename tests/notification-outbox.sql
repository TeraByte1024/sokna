/* SETUP_BEFORE_MIGRATION
-- Execute this block in the isolated legacy-schema database before applying the
-- migration, then execute this entire file after migration. No production use.
CREATE TEMP TABLE notification_migration_test_fixture (
  label text PRIMARY KEY,
  queue_id bigint NOT NULL,
  notification_id uuid NOT NULL,
  created_at timestamptz,
  read_at timestamptz,
  push_sent_at timestamptz
);
DO $fixture$
DECLARE
  v_author uuid := '20000000-0000-4000-8000-000000000001';
  v_existing uuid := '20000000-0000-4000-8000-000000000002';
  v_muted uuid := '20000000-0000-4000-8000-000000000003';
  v_new uuid := '20000000-0000-4000-8000-000000000004';
  v_gig bigint;
  v_author_performer bigint;
  v_song bigint;
  v_pending bigint;
  v_processing bigint;
  v_fresh bigint;
  v_existing_id uuid;
  v_existing_created timestamptz := now() - interval '3 hours';
  v_existing_read timestamptz := now() - interval '1 hour';
  v_existing_sent timestamptz := now() - interval '2 hours';
BEGIN
  INSERT INTO public.users (id, name, email, generation, part, status, marketing_opt_in)
  VALUES
    (v_author, 'Migration author', 'migration-author@example.test', 40, '기타', 'approved', true),
    (v_existing, 'Migration existing', 'migration-existing@example.test', 40, '베이스', 'approved', true),
    (v_muted, 'Migration muted', 'migration-muted@example.test', 40, '드럼', 'approved', false),
    (v_new, 'Migration new', 'migration-new@example.test', 40, '건반', 'approved', true);
  INSERT INTO public.gigs (title, perform_date) VALUES ('Migration test gig', current_date)
    RETURNING id INTO v_gig;
  INSERT INTO public.performers (gig_id, user_id, name, part)
    VALUES (v_gig, v_author, 'Migration author', '기타') RETURNING id INTO v_author_performer;
  INSERT INTO public.performers (gig_id, user_id, name, part)
    VALUES (v_gig, v_existing, 'Migration existing', '베이스'),
      (v_gig, v_muted, 'Migration muted', '드럼'),
      (v_gig, v_new, 'Migration new', '건반');
  INSERT INTO public.nominations (gig_id, title, created_by)
    VALUES (v_gig, 'Migration song', v_author_performer) RETURNING id INTO v_song;
  INSERT INTO public.gig_notification_queue (gig_id, triggered_by, song_ids, scheduled_at, created_at, status)
    VALUES (v_gig, v_author, ARRAY[v_song], now() - interval '2 days', now() - interval '2 days', 'pending')
    RETURNING id INTO v_pending;
  INSERT INTO public.gig_notification_queue (gig_id, triggered_by, song_ids, scheduled_at, created_at, status)
    VALUES (v_gig, v_author, ARRAY[v_song], now(), now() - interval '2 days', 'processing')
    RETURNING id INTO v_processing;
  INSERT INTO public.gig_notification_queue (gig_id, triggered_by, song_ids, scheduled_at, created_at, status)
    VALUES (v_gig, v_author, ARRAY[v_song], now(), now() - interval '1 hour', 'pending')
    RETURNING id INTO v_fresh;
  v_existing_id := extensions.uuid_generate_v5('af7345df-195a-4a39-98af-239fe2a2e3bf'::uuid,
    'nomination:' || v_pending::text || ':' || v_existing::text);
  INSERT INTO public.notifications (id, user_id, title, body, link, created_at, read_at,
    push_eligible, push_status, push_attempted_at, push_sent_at, push_error)
  VALUES (v_existing_id, v_existing, 'Original queue snapshot', 'Original body', '/',
    v_existing_created, v_existing_read, true, 'sent', v_existing_sent, v_existing_sent,
    '{"version":1,"successfulProfileIds":["existing-device"],"failures":[],"attempts":2}');
  -- A queue lease can be old while an already-materialized outbox is recent.
  -- Preserve that outbox's partial device progress and future retry deadline.
  INSERT INTO public.notifications (id, user_id, title, body, link, created_at,
    push_eligible, push_status, push_attempted_at, push_sent_at, push_error)
  VALUES (extensions.uuid_generate_v5('af7345df-195a-4a39-98af-239fe2a2e3bf'::uuid,
      'nomination:' || v_processing::text || ':' || v_existing::text),
    v_existing, 'Processing snapshot', 'Processing body', '/', v_existing_created,
    true, 'processing', now() - interval '1 minute', v_existing_sent,
    jsonb_build_object('version', 1, 'successfulProfileIds', jsonb_build_array('processing-device'),
      'failures', '[]'::jsonb, 'attempts', 3, 'nextAttemptAt', now() + interval '10 minutes')::text);
  -- Legacy providers could store full messages; keep only code-shaped reasons.
  INSERT INTO public.notifications (id, user_id, title, push_eligible, push_status, push_error)
  VALUES
    ('30000000-0000-4000-8000-000000000001', v_existing, 'Raw provider error', true, 'failed',
      'Provider rejected token=PRIVATE_TOKEN_VALUE with a detailed explanation'),
    ('30000000-0000-4000-8000-000000000002', v_existing, 'Checkpoint reason', true, 'pending',
      '{"version":1,"successfulProfileIds":["kept-success"],"failures":[{"profileId":"kept-permanent","code":"messaging/invalid-registration-token","retryable":false}],"attempts":2,"reason":"Provider detail PRIVATE_TOKEN_VALUE"}'),
    ('30000000-0000-4000-8000-000000000003', v_existing, 'Existing skip code', true, 'skipped', 'not_opted_in');
  INSERT INTO notification_migration_test_fixture VALUES
    ('existing-processing', v_processing, extensions.uuid_generate_v5('af7345df-195a-4a39-98af-239fe2a2e3bf'::uuid,
      'nomination:' || v_processing::text || ':' || v_existing::text), v_existing_created, NULL, v_existing_sent),
    ('existing', v_pending, v_existing_id, v_existing_created, v_existing_read, v_existing_sent),
    ('expired-pending', v_pending, extensions.uuid_generate_v5('af7345df-195a-4a39-98af-239fe2a2e3bf'::uuid,
      'nomination:' || v_pending::text || ':' || v_new::text), NULL, NULL, NULL),
    ('expired-processing', v_processing, extensions.uuid_generate_v5('af7345df-195a-4a39-98af-239fe2a2e3bf'::uuid,
      'nomination:' || v_processing::text || ':' || v_new::text), NULL, NULL, NULL),
    ('expired-muted', v_pending, extensions.uuid_generate_v5('af7345df-195a-4a39-98af-239fe2a2e3bf'::uuid,
      'nomination:' || v_pending::text || ':' || v_muted::text), NULL, NULL, NULL),
    ('fresh', v_fresh, extensions.uuid_generate_v5('af7345df-195a-4a39-98af-239fe2a2e3bf'::uuid,
      'nomination:' || v_fresh::text || ':' || v_new::text), NULL, NULL, NULL);
END $fixture$;
END_SETUP_BEFORE_MIGRATION */

-- Run only against an isolated test database after the notification-outbox migration.
-- All fixture writes, including schema probes, are rolled back.
BEGIN;

DO $migration_assertions$
DECLARE
  v_fixture record;
BEGIN
  IF to_regclass('pg_temp.notification_migration_test_fixture') IS NULL THEN
    RAISE EXCEPTION 'Execute SETUP_BEFORE_MIGRATION before running the outbox migration';
  END IF;
  FOR v_fixture IN SELECT * FROM notification_migration_test_fixture LOOP
    IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE id = v_fixture.notification_id
        AND event_type = 'nomination_added' AND event_key = 'legacy-queue:' || v_fixture.queue_id::text) THEN
      RAISE EXCEPTION 'Missing or duplicated legacy outbox identity: %', v_fixture.label;
    END IF;
    IF v_fixture.label = 'existing' THEN
      IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE id = v_fixture.notification_id
          AND title = 'Original queue snapshot' AND body = 'Original body'
          AND created_at = v_fixture.created_at AND read_at = v_fixture.read_at
          AND push_sent_at = v_fixture.push_sent_at AND push_status = 'accepted'
          AND push_attempts = 2 AND push_progress = '{"successfulProfileIds":["existing-device"],"failures":[]}'::jsonb) THEN
        RAISE EXCEPTION 'Existing legacy outbox content/read/delivery history was modified';
      END IF;
    ELSIF v_fixture.label = 'existing-processing' THEN
      IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE id = v_fixture.notification_id
          AND title = 'Processing snapshot' AND body = 'Processing body'
          AND created_at = v_fixture.created_at AND read_at IS NULL
          AND push_sent_at = v_fixture.push_sent_at AND push_status = 'pending'
          AND push_attempts = 3 AND push_next_attempt_at > now() + interval '9 minutes'
          AND push_progress = '{"successfulProfileIds":["processing-device"],"failures":[]}'::jsonb) THEN
        RAISE EXCEPTION 'Existing processing outbox must retain progress and the longer retry/lease deadline';
      END IF;
    ELSIF v_fixture.label IN ('expired-pending', 'expired-processing') THEN
      IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE id = v_fixture.notification_id
          AND push_status = 'failed' AND push_error = 'retry_window_expired'
          AND push_attempts = 0 AND created_at > now() - interval '1 minute'
          AND read_at IS NULL AND push_sent_at IS NULL) THEN
        RAISE EXCEPTION 'Expired recovered events must enter the inbox without restarting push delivery: %', v_fixture.label;
      END IF;
    ELSIF v_fixture.label = 'expired-muted' THEN
      IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE id = v_fixture.notification_id
          AND push_status = 'skipped' AND push_error = 'not_opted_in') THEN
        RAISE EXCEPTION 'Expired queue recovery must preserve opted-out skip semantics';
      END IF;
    ELSIF v_fixture.label = 'fresh' THEN
      IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE id = v_fixture.notification_id
          AND push_status = 'pending' AND push_error IS NULL AND push_next_attempt_at <= now()) THEN
        RAISE EXCEPTION 'Recent queue recovery must still be eligible for immediate push';
      END IF;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM public.notifications
      WHERE id = '30000000-0000-4000-8000-000000000001'
      AND push_status = 'failed' AND push_error = 'legacy_error')
    OR NOT EXISTS (SELECT 1 FROM public.notifications
      WHERE id = '30000000-0000-4000-8000-000000000002'
      AND push_status = 'pending' AND push_error = 'legacy_error' AND push_attempts = 2
      AND push_progress = '{"successfulProfileIds":["kept-success"],"failures":[{"profileId":"kept-permanent","code":"messaging/invalid-registration-token","retryable":false}]}'::jsonb)
    OR NOT EXISTS (SELECT 1 FROM public.notifications
      WHERE id = '30000000-0000-4000-8000-000000000003'
      AND push_status = 'skipped' AND push_error = 'not_opted_in') THEN
    RAISE EXCEPTION 'Legacy error normalization must preserve states, codes, and completed device checkpoints';
  END IF;
  IF EXISTS (SELECT 1 FROM public.notifications WHERE push_error LIKE '%PRIVATE_TOKEN_VALUE%') THEN
    RAISE EXCEPTION 'Provider details must not survive in normalized error codes';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
      AND table_name = 'notifications' AND column_name IN ('next_attempt_at', 'push_eligible')) THEN
    RAISE EXCEPTION 'Retired notification columns must not remain';
  END IF;
END $migration_assertions$;

DO $$
DECLARE
  v_author uuid := '10000000-0000-4000-8000-000000000001';
  v_member uuid := '10000000-0000-4000-8000-000000000002';
  v_muted uuid := '10000000-0000-4000-8000-000000000003';
  v_admin uuid := '10000000-0000-4000-8000-000000000004';
  v_applicant uuid := '10000000-0000-4000-8000-000000000005';
  v_email_applicant uuid := '10000000-0000-4000-8000-000000000006';
  v_oauth_draft uuid := '10000000-0000-4000-8000-000000000007';
  v_gig bigint;
  v_author_performer bigint;
  v_nomination bigint;
  v_second bigint;
  v_notification uuid;
  v_before integer;
  v_read_at timestamptz := now() - interval '1 minute';
  v_created_at timestamptz;
BEGIN
  INSERT INTO public.users (id, name, email, generation, part, status, marketing_opt_in)
  VALUES
    (v_author, 'Outbox author', 'outbox-author@example.test', 40, '기타', 'approved', true),
    (v_member, 'Outbox member', 'outbox-member@example.test', 40, '베이스', 'approved', true),
    (v_muted, 'Outbox muted', 'outbox-muted@example.test', 40, '드럼', 'approved', false),
    (v_admin, 'Outbox admin', 'outbox-admin@example.test', 40, '건반', 'approved', true);
  -- A plain inbox insert must not become push-eligible just because its owner opted in.
  INSERT INTO public.notifications (user_id, title, body, link)
    VALUES (v_member, 'Inbox only', 'No explicit push request', '/') RETURNING id INTO v_notification;
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE id = v_notification
      AND event_type = 'legacy' AND push_status = 'skipped' AND push_attempts = 0
      AND push_sent_at IS NULL AND read_at IS NULL) THEN
    RAISE EXCEPTION 'Plain inbox inserts must default to skipped, never pending push';
  END IF;
  INSERT INTO public.admins (id, email, name)
    VALUES (v_admin, 'outbox-admin@example.test', 'Outbox admin');
  -- Exercise the real auth -> member profile -> account inbox trigger chain.
  -- This detects duplicate messages if the old auth trigger's insertion loop
  -- accidentally survives alongside the new users trigger.
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (v_email_applicant, 'outbox-email-applicant@example.test',
    '{"name":" Email applicant ","generation":42,"part":" 보컬 ","marketing_opt_in":true}'::jsonb);
  IF (SELECT count(*) FROM public.users WHERE id = v_email_applicant
      AND name = 'Email applicant' AND generation = 42 AND part = '보컬'
      AND status = 'pending' AND marketing_opt_in = true) <> 1 THEN
    RAISE EXCEPTION 'Email auth signup must create exactly one complete pending member profile';
  END IF;
  IF (SELECT count(*) FROM public.notifications WHERE user_id = v_admin
      AND event_type = 'member_approval_requested'
      AND event_key LIKE 'member-application:' || v_email_applicant::text || ':%') <> 1
    OR (SELECT count(*) FROM public.notifications WHERE user_id = v_admin
      AND title = '신규 회원가입 승인 요청'
      AND body = 'Email applicant (42기, 보컬)님이 가입 승인을 요청했습니다.') <> 1 THEN
    RAISE EXCEPTION 'Email auth signup must create exactly one approval request per administrator';
  END IF;

  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (v_oauth_draft, 'outbox-oauth-draft@example.test', '{"name":"OAuth draft"}'::jsonb);
  IF (SELECT count(*) FROM public.users WHERE id = v_oauth_draft
      AND name = 'OAuth draft' AND status = 'pending' AND generation IS NULL
      AND part IS NULL AND marketing_opt_in = false) <> 1 THEN
    RAISE EXCEPTION 'Incomplete OAuth auth signup must create only a draft member profile';
  END IF;
  IF EXISTS (SELECT 1 FROM public.notifications
      WHERE event_key LIKE 'member-application:' || v_oauth_draft::text || ':%')
    OR EXISTS (SELECT 1 FROM public.notifications WHERE user_id = v_admin
      AND title = '신규 회원가입 승인 요청' AND body LIKE 'OAuth draft%') THEN
    RAISE EXCEPTION 'Incomplete OAuth auth signup must not notify administrators';
  END IF;

  INSERT INTO public.gigs (title, perform_date) VALUES ('Outbox test gig', current_date)
    RETURNING id INTO v_gig;
  INSERT INTO public.performers (gig_id, user_id, name, part)
    VALUES (v_gig, v_author, 'Outbox author', '기타') RETURNING id INTO v_author_performer;
  INSERT INTO public.performers (gig_id, user_id, name, part)
    VALUES (v_gig, v_member, 'Outbox member', '베이스'), (v_gig, v_muted, 'Outbox muted', '드럼');

  PERFORM set_config('request.jwt.claim.sub', v_author::text, true);
  PERFORM set_config('request.jwt.claim.email', 'outbox-author@example.test', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_author, 'email', 'outbox-author@example.test')::text, true);
  INSERT INTO public.nominations (gig_id, title, created_by)
    VALUES (v_gig, 'Atomic song', v_author_performer) RETURNING id INTO v_nomination;
  IF (SELECT count(*) FROM public.notifications WHERE event_type = 'nomination_added'
      AND event_key = 'nomination:' || v_nomination::text) <> 2 THEN
    RAISE EXCEPTION 'A nomination must create one inbox row per other participant';
  END IF;
  IF EXISTS (SELECT 1 FROM public.notifications WHERE event_key = 'nomination:' || v_nomination::text AND user_id = v_author) THEN
    RAISE EXCEPTION 'The authenticated author must be excluded';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE event_key = 'nomination:' || v_nomination::text
      AND user_id = v_muted AND push_status = 'skipped' AND push_error = 'not_opted_in') THEN
    RAISE EXCEPTION 'Opted-out accounts still need an inbox row but no push';
  END IF;
  SELECT id, created_at INTO v_notification, v_created_at FROM public.notifications
    WHERE event_key = 'nomination:' || v_nomination::text AND user_id = v_member;
  UPDATE public.notifications SET read_at = v_read_at, push_status = 'accepted',
    push_progress = '{"successfulProfileIds":["device-a"],"failures":[]}'::jsonb
    WHERE id = v_notification;
  PERFORM public.create_app_notification(v_member, 'nomination_added', 'nomination:' || v_nomination::text,
    jsonb_build_object('gig_id', v_gig, 'gig_title', 'Changed gig', 'song_titles', 'Changed song'));
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE id = v_notification
      AND read_at = v_read_at AND created_at = v_created_at AND push_status = 'accepted'
      AND push_progress->'successfulProfileIds' = '["device-a"]'::jsonb
      AND title = '[Outbox test gig] 선곡회의 새 후보곡 등록') THEN
    RAISE EXCEPTION 'Recreating an event must preserve its snapshot, read state, and completed delivery';
  END IF;

  -- No session on an import: created_by supplies the author account fallback.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.email', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);
  INSERT INTO public.nominations (gig_id, title, created_by)
    VALUES (v_gig, 'Imported song', v_author_performer) RETURNING id INTO v_second;
  IF EXISTS (SELECT 1 FROM public.notifications WHERE event_key = 'nomination:' || v_second::text AND user_id = v_author)
    OR (SELECT count(*) FROM public.notifications WHERE event_key = 'nomination:' || v_second::text) <> 2 THEN
    RAISE EXCEPTION 'Service imports must exclude the linked created_by account';
  END IF;

  -- Draft creation emits no request; completing it emits exactly one per admin.
  INSERT INTO public.users (id, name, email, status, marketing_opt_in)
    VALUES (v_applicant, 'Outbox applicant', 'outbox-applicant@example.test', 'pending', false);
  IF EXISTS (SELECT 1 FROM public.notifications WHERE event_type = 'member_approval_requested'
      AND event_key LIKE 'member-application:' || v_applicant::text || ':%') THEN
    RAISE EXCEPTION 'Incomplete social profiles must not request approval';
  END IF;
  UPDATE public.users SET generation = 41, part = '보컬', applied_at = '2026-09-27T03:04:05.123Z'
    WHERE id = v_applicant;
  IF (SELECT count(*) FROM public.notifications WHERE user_id = v_admin AND event_type = 'member_approval_requested'
      AND event_key = 'member-application:' || v_applicant::text || ':2026-09-27T03:04:05.123Z') <> 1 THEN
    RAISE EXCEPTION 'Completed applications must use the stable millisecond UTC event key';
  END IF;
  SELECT count(*) INTO v_before FROM public.notifications WHERE user_id = v_admin
    AND event_type = 'member_approval_requested' AND event_key LIKE 'member-application:' || v_applicant::text || ':%';
  UPDATE public.users SET name = 'Edited applicant', applied_at = now() WHERE id = v_applicant;
  IF (SELECT count(*) FROM public.notifications WHERE user_id = v_admin AND event_type = 'member_approval_requested'
      AND event_key LIKE 'member-application:' || v_applicant::text || ':%') <> v_before THEN
    RAISE EXCEPTION 'An already complete pending profile must not emit a duplicate request';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_author::text, true);
  PERFORM set_config('request.jwt.claim.email', 'outbox-author@example.test', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_author, 'email', 'outbox-author@example.test')::text, true);
  BEGIN
    PERFORM public.approve_member_with_notification(v_applicant);
    RAISE EXCEPTION 'A non-admin must not approve a member';
  EXCEPTION WHEN insufficient_privilege THEN
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_applicant AND status = 'pending') THEN
      RAISE EXCEPTION 'Rejected approval must not modify the applicant';
    END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config('request.jwt.claim.email', 'outbox-admin@example.test', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'email', 'outbox-admin@example.test')::text, true);
  IF NOT public.approve_member_with_notification(v_applicant)
    OR public.approve_member_with_notification(v_applicant) THEN
    RAISE EXCEPTION 'Approval must atomically succeed once and reject a repeated approval';
  END IF;
  IF (SELECT count(*) FROM public.notifications WHERE user_id = v_applicant AND event_type = 'member_approved'
      AND push_status = 'skipped') <> 1 THEN
    RAISE EXCEPTION 'Approval of an opted-out account still needs exactly one inbox row';
  END IF;

  IF has_function_privilege('authenticated', 'public.create_app_notification(uuid,text,text,jsonb,uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.create_app_notification(uuid,text,text,jsonb,uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.approve_member_with_notification(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Private emitters and approval RPC must retain their restricted execution grants';
  END IF;
  IF to_regclass('public.gig_notification_queue') IS NOT NULL THEN
    RAISE EXCEPTION 'The intermediate nomination queue must be retired';
  END IF;

  -- Force a notification insert failure: the candidate song must roll back too.
  ALTER TABLE public.notifications ADD CONSTRAINT notification_atomicity_test
    CHECK (body NOT LIKE '%atomic failure probe%');
  BEGIN
    INSERT INTO public.nominations (gig_id, title, created_by)
      VALUES (v_gig, 'atomic failure probe', v_author_performer);
    RAISE EXCEPTION 'Expected the notification constraint to reject the nomination';
  EXCEPTION WHEN check_violation THEN
    IF EXISTS (SELECT 1 FROM public.nominations WHERE gig_id = v_gig AND title = 'atomic failure probe') THEN
      RAISE EXCEPTION 'Notification failure must roll back the business insert';
    END IF;
  END;
END $$;

ROLLBACK;
