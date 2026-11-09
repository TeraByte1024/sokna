BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.gigs
  ADD COLUMN ticket_booking_mode text
    CHECK (ticket_booking_mode IN ('manual', 'scheduled')),
  ADD CONSTRAINT gigs_scheduled_booking_period CHECK (
    ticket_booking_mode IS DISTINCT FROM 'scheduled'
    OR (advance_booking_starts_at IS NOT NULL AND advance_booking_deadline IS NOT NULL
        AND advance_booking_starts_at <= advance_booking_deadline)
  );

COMMENT ON COLUMN public.gigs.ticket_booking_mode IS
  'manual uses ticket_booking_enabled until showtime; scheduled uses the start and deadline; null preserves legacy rules.';

CREATE OR REPLACE FUNCTION public.get_ticket_booking_offer(p_gig_id bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  g public.gigs;
  account public.payment_accounts;
  starts_at timestamptz;
  deadline timestamptz;
  performance_start timestamptz;
  remaining integer;
  result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE='42501'; END IF;
  -- Match the gigs read policy because SECURITY DEFINER bypasses table RLS.
  SELECT * INTO g FROM public.gigs
  WHERE id = p_gig_id AND (
    visibility = 'public' OR public.is_admin()
    OR (visibility = 'members' AND public.is_approved_member())
  );
  IF NOT FOUND THEN RAISE EXCEPTION '예매 가능한 공연을 찾을 수 없습니다.' USING ERRCODE='22023'; END IF;

  performance_start := (g.perform_date::date + coalesce(g.perform_time::time, time '23:59')) AT TIME ZONE 'Asia/Seoul';
  IF g.ticket_booking_mode IS DISTINCT FROM 'manual' THEN
    starts_at := g.advance_booking_starts_at;
    deadline := coalesce(g.advance_booking_deadline, (g.perform_date::date::timestamp - interval '1 minute') AT TIME ZONE 'Asia/Seoul');
  END IF;

  SELECT * INTO account FROM public.payment_accounts WHERE active;
  SELECT coalesce(g.ticket_capacity,0) - coalesce(sum(quantity),0)::integer INTO remaining
    FROM public.ticket_reservations WHERE gig_id=g.id AND status <> 'cancelled';
  result := jsonb_build_object('gig_id',g.id,'title',g.title,'date',g.perform_date,'time',g.perform_time,
    'location',g.location,'poster_url',g.poster_url,'unit_price',g.advance_ticket_price,
    'starts_at',starts_at,'deadline',deadline,'remaining',remaining,
    'notice',coalesce(g.notice,''),'refund_policy',coalesce(g.ticket_refund_policy,''),
    'privacy_notice',public.ticket_privacy_notice(),'account',CASE WHEN account.id IS NOT NULL THEN
      jsonb_build_object('id',account.id,'bank',account.bank,'account_number',account.account_number,'holder',account.holder,'instruction',account.instruction) ELSE NULL END,
    'enabled',g.ticket_booking_enabled,'server_time',now(),
    'open',g.ticket_booking_enabled AND g.ticket_capacity IS NOT NULL AND g.advance_ticket_price IS NOT NULL
      AND g.advance_ticket_price >= 0
      AND (g.advance_ticket_price=0 OR account.id IS NOT NULL) AND remaining > 0
      AND performance_start IS NOT NULL AND now() < performance_start
      AND (g.ticket_booking_mode IS NOT DISTINCT FROM 'manual' OR (
        (starts_at IS NULL OR now() >= date_trunc('minute',starts_at))
        AND deadline IS NOT NULL AND now() < date_trunc('minute',deadline) + interval '1 minute'
      )));
  RETURN result || jsonb_build_object('offer_hash',md5((result - 'remaining' - 'server_time' - 'open')::text));
END;
$$;

COMMIT;
