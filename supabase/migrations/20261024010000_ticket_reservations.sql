BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.gigs
  ADD COLUMN notice text CHECK (length(notice) <= 10000),
  ADD COLUMN advance_booking_deadline timestamptz,
  ADD COLUMN ticket_booking_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN ticket_capacity integer CHECK (ticket_capacity BETWEEN 1 AND 1000000),
  ADD COLUMN ticket_refund_policy text CHECK (length(ticket_refund_policy) <= 10000);

CREATE TABLE public.payment_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank text NOT NULL CHECK (length(btrim(bank)) BETWEEN 1 AND 80),
  account_number text NOT NULL CHECK (account_number ~ '^[0-9]{6,32}$'),
  holder text NOT NULL CHECK (length(btrim(holder)) BETWEEN 1 AND 80),
  instruction text NOT NULL DEFAULT '' CHECK (length(instruction) <= 2000),
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payment_accounts_one_active ON public.payment_accounts (active) WHERE active;
ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_accounts_admin_read ON public.payment_accounts FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.payment_accounts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.payment_accounts TO authenticated, service_role;

CREATE TABLE public.ticket_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gig_id bigint NOT NULL REFERENCES public.gigs(id) ON DELETE RESTRICT,
  request_key uuid NOT NULL,
  buyer_name text NOT NULL CHECK (length(btrim(buyer_name)) BETWEEN 1 AND 80),
  phone text NOT NULL CHECK (phone ~ '^01[016789][0-9]{7,8}$'),
  depositor text NOT NULL CHECK (length(btrim(depositor)) BETWEEN 1 AND 80),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price bigint NOT NULL CHECK (unit_price >= 0),
  total_amount bigint NOT NULL CHECK (total_amount = unit_price * quantity AND total_amount <= 9007199254740991),
  gig_snapshot jsonb NOT NULL,
  account_id uuid REFERENCES public.payment_accounts(id) ON DELETE RESTRICT,
  account_snapshot jsonb,
  notice_snapshot text NOT NULL,
  refund_policy_snapshot text NOT NULL,
  privacy_snapshot text NOT NULL,
  consented_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN ('awaiting_payment','approved','cancelled')),
  paid_amount bigint NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  payment_reported_at timestamptz,
  approved_at timestamptz,
  cancellation_requested_at timestamptz,
  cancellation_reason text,
  refund_bank text,
  refund_account text,
  refund_holder text,
  refund_status text NOT NULL DEFAULT 'none' CHECK (refund_status IN ('none','requested','processing','completed')),
  refund_amount bigint NOT NULL DEFAULT 0 CHECK (refund_amount >= 0 AND refund_amount <= paid_amount),
  admitted_quantity integer NOT NULL DEFAULT 0 CHECK (admitted_quantity BETWEEN 0 AND quantity),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_key)
);
CREATE INDEX ticket_reservations_gig_status ON public.ticket_reservations (gig_id, status);
CREATE INDEX ticket_reservations_owner ON public.ticket_reservations (user_id, created_at DESC);
ALTER TABLE public.ticket_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY ticket_reservations_own_read ON public.ticket_reservations FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_admin());
REVOKE ALL ON public.ticket_reservations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.ticket_reservations TO authenticated, service_role;

CREATE TABLE public.ticket_reservation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.ticket_reservations(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  detail text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ticket_reservation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY ticket_events_own_read ON public.ticket_reservation_events FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.ticket_reservations r WHERE r.id = reservation_id AND (r.user_id = (SELECT auth.uid()) OR public.is_admin()))
);
REVOKE ALL ON public.ticket_reservation_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.ticket_reservation_events TO authenticated, service_role;

CREATE TABLE public.ticket_fund_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.ticket_reservations(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.payment_accounts(id) ON DELETE RESTRICT,
  direction text NOT NULL CHECK (direction IN ('deposit','refund')),
  amount bigint NOT NULL CHECK (amount > 0),
  reference text NOT NULL CHECK (length(btrim(reference)) BETWEEN 1 AND 160),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, direction, reference)
);
ALTER TABLE public.ticket_fund_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY ticket_funds_admin_read ON public.ticket_fund_entries FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.ticket_fund_entries FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.ticket_fund_entries TO authenticated, service_role;

-- Audience recipients have Auth accounts without membership profiles. Preserve
-- existing notification rows and deletion behavior while allowing these IDs.
ALTER TABLE public.notifications DROP CONSTRAINT notifications_user_id_fkey;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.notifications DROP CONSTRAINT notifications_event_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_event_type_check CHECK
  (event_type IN ('member_approval_requested','member_approved','gig_rsvp_requested','nomination_added','nomination_updated','legacy','ticket_reservation'));

CREATE FUNCTION public.ticket_privacy_notice() RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT '공연 예매·입금 확인·취소/환불·입장 안내를 위해 계정 식별자, 이름, 휴대전화 번호, 입금자명, 예매 내역과 동의 시각을 수집·이용합니다. 환불 요청 시 은행·계좌번호·예금주를 추가 수집합니다. 서비스 계정 탈퇴 시 파기하며 법령상 보존 의무가 있는 기록은 해당 기간 동안 별도 보관합니다. 동의를 거부할 수 있으나 예매가 제한됩니다. 문의: sokna1986hanyang@gmail.com';
$$;
REVOKE ALL ON FUNCTION public.ticket_privacy_notice() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.ticket_notify(p_reservation uuid, p_action text, p_detail text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.ticket_reservations; recipient uuid; title text; event_key text;
BEGIN
  SELECT * INTO STRICT r FROM public.ticket_reservations WHERE id = p_reservation;
  title := CASE p_action WHEN 'created' THEN '예매 신청 접수' WHEN 'approved' THEN '예매 승인'
    WHEN 'payment_reported' THEN '입금 확인 요청' WHEN 'payment_recorded' THEN '입금 확인 기록' WHEN 'cancel_requested' THEN '예매 취소·환불 요청'
    WHEN 'cancelled' THEN '예매 취소 처리' WHEN 'refund_completed' THEN '환불 완료'
    WHEN 'cancel_rejected' THEN '예매 취소 요청 검토 결과' ELSE '예매 처리 안내' END;
  event_key := r.id::text || ':' || p_action || ':' || r.version::text;
  INSERT INTO public.ticket_reservation_events (reservation_id,actor_id,action,detail)
    VALUES (r.id,auth.uid(),p_action,p_detail);
  IF p_action = 'check_in' THEN RETURN; END IF;
  FOR recipient IN SELECT DISTINCT id FROM (
    SELECT r.user_id AS id UNION ALL SELECT a.id FROM public.admins a
  ) recipients LOOP
    INSERT INTO public.notifications (user_id,event_type,event_key,title,body,link,push_status,push_error)
    VALUES (recipient,'ticket_reservation',event_key,title,
      coalesce(r.gig_snapshot->>'title','공연') || ' · 예매번호 ' || r.code,
      CASE WHEN recipient = r.user_id THEN '/reservations/' || r.id ELSE '/admin/gigs/' || r.gig_id || '/reservations' END,
      'skipped','external_delivery_disabled') ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.ticket_notify(uuid,text,text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_ticket_booking_offer(p_gig_id bigint) RETURNS jsonb
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
      AND g.advance_ticket_price >= 0 AND nullif(btrim(g.ticket_refund_policy),'') IS NOT NULL
      AND (g.advance_ticket_price=0 OR account.id IS NOT NULL) AND remaining > 0
      AND deadline IS NOT NULL AND now() < date_trunc('minute',deadline) + interval '1 minute'
      AND now() < (g.perform_date::date + coalesce(g.perform_time::time,time '23:59')) AT TIME ZONE 'Asia/Seoul');
  -- Exclude availability/time: another audience's purchase does not change the agreed price/policies.
  RETURN result || jsonb_build_object('offer_hash',md5((result - 'remaining' - 'server_time' - 'open')::text));
END;
$$;
REVOKE ALL ON FUNCTION public.get_ticket_booking_offer(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ticket_booking_offer(bigint) TO authenticated;

CREATE FUNCTION public.create_ticket_reservation(p_gig_id bigint,p_request_key uuid,p_name text,p_phone text,p_depositor text,
  p_quantity integer,p_offer_hash text,p_privacy_agreed boolean,p_policy_agreed boolean) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE offer jsonb; existing uuid; result uuid; price bigint;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE='42501'; END IF;
  IF p_request_key IS NULL THEN RAISE EXCEPTION '요청 정보를 확인해 주세요.' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text || p_request_key::text,0));
  SELECT id INTO existing FROM public.ticket_reservations WHERE user_id=auth.uid() AND request_key=p_request_key;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  PERFORM 1 FROM public.gigs WHERE id=p_gig_id FOR UPDATE;
  PERFORM pg_advisory_xact_lock(684290124);
  offer := public.get_ticket_booking_offer(p_gig_id);
  IF (offer->>'open')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION '예매가 마감되었거나 판매 설정이 준비되지 않았습니다.' USING ERRCODE='22023'; END IF;
  IF p_offer_hash IS DISTINCT FROM offer->>'offer_hash' THEN RAISE EXCEPTION '공연·가격·안내가 변경되었습니다. 새로고침 후 다시 확인해 주세요.' USING ERRCODE='22023'; END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > (offer->>'remaining')::integer THEN
    RAISE EXCEPTION '잔여 매수 내에서 수량을 선택해 주세요.' USING ERRCODE='22023'; END IF;
  IF p_privacy_agreed IS DISTINCT FROM true OR p_policy_agreed IS DISTINCT FROM true THEN
    RAISE EXCEPTION '필수 안내에 동의해 주세요.' USING ERRCODE='22023'; END IF;
  IF length(btrim(coalesce(p_name,''))) NOT BETWEEN 1 AND 80 OR length(btrim(coalesce(p_depositor,''))) NOT BETWEEN 1 AND 80
    OR coalesce(p_phone,'') !~ '^01[016789][0-9]{7,8}$' THEN
    RAISE EXCEPTION '이름·휴대전화 번호·입금자명을 확인해 주세요.' USING ERRCODE='22023'; END IF;
  price := (offer->>'unit_price')::bigint;
  INSERT INTO public.ticket_reservations (user_id,gig_id,request_key,buyer_name,phone,depositor,quantity,unit_price,total_amount,
    gig_snapshot,account_id,account_snapshot,notice_snapshot,refund_policy_snapshot,privacy_snapshot,status,approved_at)
  VALUES (auth.uid(),p_gig_id,p_request_key,btrim(p_name),p_phone,btrim(p_depositor),p_quantity,price,price*p_quantity,
    offer - 'account' - 'remaining' - 'offer_hash' - 'privacy_notice' - 'open' - 'server_time',
    (offer->'account'->>'id')::uuid,nullif(offer->'account','null'::jsonb),offer->>'notice',offer->>'refund_policy',offer->>'privacy_notice',
    CASE WHEN price=0 THEN 'approved' ELSE 'awaiting_payment' END,CASE WHEN price=0 THEN now() ELSE NULL END)
  RETURNING id INTO result;
  PERFORM public.ticket_notify(result,'created');
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.create_ticket_reservation(bigint,uuid,text,text,text,integer,text,boolean,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_ticket_reservation(bigint,uuid,text,text,text,integer,text,boolean,boolean) TO authenticated;

CREATE FUNCTION public.update_ticket_reservation(p_id uuid,p_version integer,p_action text,p_payload jsonb DEFAULT '{}') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.ticket_reservations; admin boolean; amount bigint; reference text; reason text; count_in integer; refunded bigint;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE='42501'; END IF;
  -- Always lock the gig first, as creation and capacity edits do.
  SELECT * INTO r FROM public.ticket_reservations WHERE id=p_id;
  admin := public.is_admin();
  IF NOT FOUND OR (r.user_id <> auth.uid() AND NOT admin) THEN RAISE EXCEPTION '예매를 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.gigs WHERE id=r.gig_id FOR UPDATE;
  SELECT * INTO STRICT r FROM public.ticket_reservations WHERE id=p_id FOR UPDATE;
  IF r.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION '처리 상태가 변경되었습니다. 새로고침 후 다시 확인해 주세요.' USING ERRCODE='22023'; END IF;
  reason := btrim(coalesce(p_payload->>'reason',''));
  IF length(reason)>1000 THEN RAISE EXCEPTION '사유는 1000자 이내로 입력해 주세요.' USING ERRCODE='22023'; END IF;
  IF p_action='payment_reported' THEN
    IF r.status<>'awaiting_payment' OR r.cancellation_requested_at IS NOT NULL THEN RAISE EXCEPTION '입금 신고가 가능한 상태가 아닙니다.' USING ERRCODE='22023'; END IF;
    IF r.payment_reported_at IS NOT NULL THEN RETURN; END IF;
    UPDATE public.ticket_reservations SET payment_reported_at=now(),version=version+1 WHERE id=r.id;
  ELSIF p_action='cancel_requested' THEN
    IF (r.status='cancelled' OR r.cancellation_requested_at IS NOT NULL)
      AND NOT (r.status='cancelled' AND r.refund_status='requested' AND r.refund_account IS NULL AND r.paid_amount>0) THEN
      RAISE EXCEPTION '이미 취소 처리 중이거나 취소된 예매입니다.' USING ERRCODE='22023'; END IF;
    IF reason='' THEN RAISE EXCEPTION '취소 사유를 입력해 주세요.' USING ERRCODE='22023'; END IF;
    IF r.admitted_quantity=0 AND r.paid_amount=0 AND r.payment_reported_at IS NULL
      AND (r.total_amount=0 OR coalesce((p_payload->>'unpaid')::boolean,false)) THEN
      UPDATE public.ticket_reservations SET status='cancelled',cancellation_reason=reason,version=version+1 WHERE id=r.id;
      p_action := 'cancelled';
    ELSE
      IF r.total_amount>0 AND (length(btrim(coalesce(p_payload->>'bank',''))) NOT BETWEEN 1 AND 80
        OR coalesce(p_payload->>'account_number','') !~ '^[0-9]{6,32}$'
        OR length(btrim(coalesce(p_payload->>'holder',''))) NOT BETWEEN 1 AND 80) THEN
        RAISE EXCEPTION '환불받을 계좌를 확인해 주세요.' USING ERRCODE='22023'; END IF;
      UPDATE public.ticket_reservations SET cancellation_requested_at=now(),cancellation_reason=reason,
        refund_bank=p_payload->>'bank',refund_account=p_payload->>'account_number',refund_holder=p_payload->>'holder',
        refund_status=CASE WHEN r.total_amount>0 THEN 'requested' ELSE 'none' END,version=version+1 WHERE id=r.id;
    END IF;
  ELSE
    IF NOT admin THEN RAISE EXCEPTION '관리자만 처리할 수 있습니다.' USING ERRCODE='42501'; END IF;
    reference := btrim(coalesce(p_payload->>'reference',''));
    IF p_action='payment_recorded' THEN
      IF r.account_id IS NULL OR r.total_amount=0 THEN RAISE EXCEPTION '무료 예매에는 입금을 기록할 수 없습니다.' USING ERRCODE='22023'; END IF;
      amount := (p_payload->>'amount')::bigint;
      IF amount IS NULL OR amount<=0 OR amount>9007199254740991-r.paid_amount OR reference='' THEN
        RAISE EXCEPTION '실입금액과 거래 확인 번호를 확인해 주세요.' USING ERRCODE='22023'; END IF;
      INSERT INTO public.ticket_fund_entries(reservation_id,account_id,direction,amount,reference,actor_id)
        VALUES(r.id,r.account_id,'deposit',amount,reference,auth.uid());
      UPDATE public.ticket_reservations SET paid_amount=paid_amount+amount,
        refund_status=CASE WHEN r.status='cancelled' THEN 'requested' ELSE refund_status END,version=version+1 WHERE id=r.id;
    ELSIF p_action='approved' THEN
      IF r.status<>'awaiting_payment' OR r.cancellation_requested_at IS NOT NULL THEN RAISE EXCEPTION '승인 가능한 예매가 아닙니다.' USING ERRCODE='22023'; END IF;
      amount := (p_payload->>'amount')::bigint;
      IF amount IS DISTINCT FROM r.total_amount OR reference='' THEN RAISE EXCEPTION '실입금액과 거래 확인 번호를 입력해 주세요.' USING ERRCODE='22023'; END IF;
      IF r.paid_amount=0 THEN
        INSERT INTO public.ticket_fund_entries(reservation_id,account_id,direction,amount,reference,actor_id)
          VALUES(r.id,r.account_id,'deposit',amount,reference,auth.uid());
      ELSIF r.paid_amount<>amount THEN RAISE EXCEPTION '기록된 입금액이 예매 금액과 다릅니다. 입금 내역을 먼저 확인해 주세요.' USING ERRCODE='22023';
      END IF;
      UPDATE public.ticket_reservations SET paid_amount=amount,status='approved',approved_at=now(),version=version+1 WHERE id=r.id;
    ELSIF p_action='cancelled' THEN
      IF (r.status='cancelled' AND r.refund_status<>'requested') OR reason='' THEN RAISE EXCEPTION '취소 상태와 사유를 확인해 주세요.' USING ERRCODE='22023'; END IF;
      amount := coalesce((p_payload->>'amount')::bigint,0);
      SELECT coalesce(sum(f.amount),0) INTO refunded FROM public.ticket_fund_entries f WHERE f.reservation_id=r.id AND direction='refund';
      IF amount<0 OR amount>r.paid_amount-refunded THEN RAISE EXCEPTION '환불액은 아직 반환하지 않은 입금액 이내여야 합니다.' USING ERRCODE='22023'; END IF;
      IF amount>0 AND r.refund_account IS NULL THEN RAISE EXCEPTION '예매자의 환불 계좌 요청을 먼저 확인해 주세요.' USING ERRCODE='22023'; END IF;
      UPDATE public.ticket_reservations SET status='cancelled',cancellation_reason=reason,refund_amount=amount,
        refund_status=CASE WHEN amount>0 THEN 'processing' ELSE 'none' END,version=version+1 WHERE id=r.id;
    ELSIF p_action='cancel_rejected' THEN
      IF r.cancellation_requested_at IS NULL OR r.status='cancelled' OR reason='' THEN RAISE EXCEPTION '취소 요청과 검토 사유를 확인해 주세요.' USING ERRCODE='22023'; END IF;
      UPDATE public.ticket_reservations SET cancellation_requested_at=NULL,refund_status='none',refund_bank=NULL,
        refund_account=NULL,refund_holder=NULL,version=version+1 WHERE id=r.id;
    ELSIF p_action='refund_completed' THEN
      IF r.status<>'cancelled' OR r.refund_status<>'processing' OR reference='' THEN RAISE EXCEPTION '환불 상태와 실제 반환 거래 번호를 확인해 주세요.' USING ERRCODE='22023'; END IF;
      INSERT INTO public.ticket_fund_entries(reservation_id,account_id,direction,amount,reference,actor_id)
        VALUES(r.id,r.account_id,'refund',r.refund_amount,reference,auth.uid());
      UPDATE public.ticket_reservations SET refund_status='completed',version=version+1 WHERE id=r.id;
    ELSIF p_action='check_in' THEN
      count_in := (p_payload->>'quantity')::integer;
      IF r.status<>'approved' OR r.cancellation_requested_at IS NOT NULL OR count_in IS NULL OR count_in<1
        OR count_in>r.quantity-r.admitted_quantity THEN RAISE EXCEPTION '승인 상태와 남은 입장 매수를 확인해 주세요.' USING ERRCODE='22023'; END IF;
      UPDATE public.ticket_reservations SET admitted_quantity=admitted_quantity+count_in,version=version+1 WHERE id=r.id;
      reason := count_in::text || '명 입장';
    ELSE RAISE EXCEPTION '지원하지 않는 처리입니다.' USING ERRCODE='22023';
    END IF;
  END IF;
  PERFORM public.ticket_notify(r.id,p_action,reason);
END;
$$;
REVOKE ALL ON FUNCTION public.update_ticket_reservation(uuid,integer,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_ticket_reservation(uuid,integer,text,jsonb) TO authenticated;

CREATE FUNCTION public.set_ticket_payment_account(p_bank text,p_number text,p_holder text,p_instruction text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION '관리자만 계좌를 설정할 수 있습니다.' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(684290124);
  UPDATE public.payment_accounts SET active=false WHERE active;
  INSERT INTO public.payment_accounts(bank,account_number,holder,instruction,created_by)
    VALUES(btrim(p_bank),p_number,btrim(p_holder),coalesce(p_instruction,''),auth.uid()) RETURNING id INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.set_ticket_payment_account(text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_ticket_payment_account(text,text,text,text) TO authenticated;

CREATE FUNCTION public.guard_ticket_gig_settings() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE held bigint; starts_at timestamptz;
BEGIN
  starts_at := (NEW.perform_date::date + coalesce(NEW.perform_time::time,time '23:59')) AT TIME ZONE 'Asia/Seoul';
  IF NEW.advance_booking_deadline IS NOT NULL AND (starts_at IS NULL OR NEW.advance_booking_deadline >= starts_at) THEN
    RAISE EXCEPTION '사전예매 마감은 공연 시작 전이어야 합니다.' USING ERRCODE='22023'; END IF;
  IF TG_OP='UPDATE' THEN
    SELECT coalesce(sum(quantity),0) INTO held FROM public.ticket_reservations WHERE gig_id=NEW.id AND status<>'cancelled';
    IF held>0 AND (NEW.ticket_capacity IS NULL OR NEW.ticket_capacity<held) THEN
      RAISE EXCEPTION '판매 매수는 이미 접수된 예매 수량보다 적게 설정할 수 없습니다.' USING ERRCODE='22023'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_ticket_gig_settings() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER gigs_guard_ticket_settings BEFORE INSERT OR UPDATE ON public.gigs FOR EACH ROW EXECUTE FUNCTION public.guard_ticket_gig_settings();

CREATE FUNCTION public.list_ticket_reservations(p_gig_id bigint DEFAULT NULL,p_search text DEFAULT '',p_offset integer DEFAULT 0,p_admin boolean DEFAULT false)
RETURNS SETOF public.ticket_reservations LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE='42501'; END IF;
  IF p_admin AND NOT public.is_admin() THEN RAISE EXCEPTION '관리자만 접근할 수 있습니다.' USING ERRCODE='42501'; END IF;
  IF p_offset IS NULL OR p_offset<0 OR length(p_search)>120 THEN RAISE EXCEPTION '검색 조건을 확인해 주세요.' USING ERRCODE='22023'; END IF;
  RETURN QUERY SELECT r.* FROM public.ticket_reservations r
    WHERE (r.user_id=auth.uid() OR (p_admin AND public.is_admin())) AND (p_gig_id IS NULL OR r.gig_id=p_gig_id)
    AND (p_search='' OR strpos(lower(concat_ws(' ',r.code,r.buyer_name,r.depositor,r.phone,r.gig_snapshot->>'title')),lower(btrim(p_search)))>0)
    ORDER BY r.created_at DESC,r.id DESC LIMIT 50 OFFSET p_offset;
END;
$$;
REVOKE ALL ON FUNCTION public.list_ticket_reservations(bigint,text,integer,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_ticket_reservations(bigint,text,integer,boolean) TO authenticated;
COMMIT;
