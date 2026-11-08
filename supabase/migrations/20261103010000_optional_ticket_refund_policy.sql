BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.get_ticket_booking_offer(p_gig_id bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE g public.gigs; account public.payment_accounts; deadline timestamptz; remaining integer; result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE='42501'; END IF;
  SELECT * INTO g FROM public.gigs WHERE id=p_gig_id AND visibility='public';
  IF NOT FOUND THEN RAISE EXCEPTION '예매 가능한 공개 공연이 아닙니다.' USING ERRCODE='22023'; END IF;
  deadline := coalesce(g.advance_booking_deadline, (g.perform_date::date::timestamp - interval '1 minute') AT TIME ZONE 'Asia/Seoul');
  SELECT * INTO account FROM public.payment_accounts WHERE active;
  SELECT coalesce(g.ticket_capacity,0) - coalesce(sum(quantity),0)::integer INTO remaining
    FROM public.ticket_reservations WHERE gig_id=g.id AND status <> 'cancelled';
  result := jsonb_build_object('gig_id',g.id,'title',g.title,'date',g.perform_date,'time',g.perform_time,
    'location',g.location,'poster_url',g.poster_url,'unit_price',g.advance_ticket_price,
    'deadline',deadline,'remaining',remaining,'notice',coalesce(g.notice,''),'refund_policy',coalesce(g.ticket_refund_policy,''),
    'privacy_notice',public.ticket_privacy_notice(),'account',CASE WHEN account.id IS NOT NULL THEN
      jsonb_build_object('id',account.id,'bank',account.bank,'account_number',account.account_number,'holder',account.holder,'instruction',account.instruction) ELSE NULL END,
    'enabled',g.ticket_booking_enabled,'server_time',now(),
    'open',g.ticket_booking_enabled AND g.ticket_capacity IS NOT NULL AND g.advance_ticket_price IS NOT NULL
      AND g.advance_ticket_price >= 0
      AND (g.advance_ticket_price=0 OR account.id IS NOT NULL) AND remaining > 0
      AND deadline IS NOT NULL AND now() < date_trunc('minute',deadline) + interval '1 minute'
      AND now() < (g.perform_date::date + coalesce(g.perform_time::time,time '23:59')) AT TIME ZONE 'Asia/Seoul');
  -- Exclude availability/time: another audience's purchase does not change the agreed price/policies.
  RETURN result || jsonb_build_object('offer_hash',md5((result - 'remaining' - 'server_time' - 'open')::text));
END;
$$;
REVOKE ALL ON FUNCTION public.get_ticket_booking_offer(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ticket_booking_offer(bigint) TO authenticated;

COMMIT;
