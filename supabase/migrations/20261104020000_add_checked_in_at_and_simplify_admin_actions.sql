BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.ticket_reservations
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;

UPDATE public.ticket_reservations r
SET checked_in_at = sub.last_checkin
FROM (
  SELECT reservation_id, max(created_at) AS last_checkin
  FROM public.ticket_reservation_events
  WHERE action = 'check_in'
  GROUP BY reservation_id
) sub
WHERE r.id = sub.reservation_id
  AND r.admitted_quantity > 0
  AND r.checked_in_at IS NULL;

CREATE OR REPLACE FUNCTION public.ticket_notify(p_reservation uuid, p_action text, p_detail text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r public.ticket_reservations;
  recipient uuid;
  title text;
  body_text text;
  event_key text;
  formatted_amount text;
  gig_title text;
BEGIN
  SELECT * INTO STRICT r FROM public.ticket_reservations WHERE id = p_reservation;

  INSERT INTO public.ticket_reservation_events (reservation_id, actor_id, action, detail)
    VALUES (r.id, auth.uid(), p_action, p_detail);

  IF p_action IN ('revoke_approval', 'undo_check_in', 'restore_reservation') THEN
    RETURN;
  END IF;

  formatted_amount := trim(to_char(r.total_amount, '999,999,999,999,990')) || '원';
  gig_title := coalesce(r.gig_snapshot->>'title', '공연');

  title := CASE p_action
    WHEN 'created' THEN '[신규 예매]'
    WHEN 'approved' THEN '[입금 확인 완료]'
    WHEN 'check_in' THEN '[입장 확인]'
    WHEN 'payment_reported' THEN '[입금 확인 요청]'
    WHEN 'payment_recorded' THEN '[입금 확인 기록]'
    WHEN 'cancel_requested' THEN '[예매 취소·환불 요청]'
    WHEN 'cancelled' THEN '[예매 취소 처리]'
    WHEN 'refund_completed' THEN '[환불 완료]'
    WHEN 'cancel_rejected' THEN '[예매 취소 요청 검토 결과]'
    ELSE '[예매 처리 안내]'
  END;

  body_text := CASE p_action
    WHEN 'created' THEN r.buyer_name || ' (' || r.depositor || ') ' || formatted_amount
    WHEN 'approved' THEN gig_title || ' 공연 ' || r.quantity::text || '매 예매가 완료되었습니다.'
    WHEN 'check_in' THEN '입장 확인되었습니다. 즐거운 관람되세요!'
    WHEN 'cancel_requested' THEN r.buyer_name || ' (' || r.depositor || ') ' || formatted_amount
    ELSE gig_title || ' · ' || r.buyer_name || ' (' || r.depositor || ') ' || formatted_amount
  END;

  event_key := r.id::text || ':' || p_action || ':' || r.version::text;

  IF p_action IN ('created', 'cancel_requested', 'payment_reported') THEN
    FOR recipient IN SELECT DISTINCT id FROM (
      SELECT r.user_id AS id UNION ALL SELECT a.id FROM public.admins a
    ) recipients LOOP
      INSERT INTO public.notifications (user_id, event_type, event_key, title, body, link, push_status, push_error)
      VALUES (
        recipient,
        'ticket_reservation',
        event_key,
        title,
        body_text,
        CASE WHEN recipient = r.user_id THEN '/reservations/' || r.id ELSE '/admin/gigs/' || r.gig_id || '/reservations' END,
        'skipped',
        'external_delivery_disabled'
      ) ON CONFLICT DO NOTHING;
    END LOOP;
  ELSE
    INSERT INTO public.notifications (user_id, event_type, event_key, title, body, link, push_status, push_error)
    VALUES (
      r.user_id,
      'ticket_reservation',
      event_key,
      title,
      body_text,
      '/reservations/' || r.id,
      'skipped',
      'external_delivery_disabled'
    ) ON CONFLICT DO NOTHING;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.ticket_notify(uuid, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_ticket_reservation(p_id uuid, p_version integer, p_action text, p_payload jsonb DEFAULT '{}') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r public.ticket_reservations;
  admin boolean;
  amount bigint;
  reference text;
  reason text;
  count_in integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE='42501'; END IF;
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

    IF p_action='approved' THEN
      IF r.status<>'awaiting_payment' OR r.cancellation_requested_at IS NOT NULL THEN RAISE EXCEPTION '승인 가능한 예매가 아닙니다.' USING ERRCODE='22023'; END IF;
      amount := r.total_amount;
      IF reference = '' THEN
        reference := 'AUTO-APPROVE-' || r.id::text || '-v' || r.version::text;
      END IF;
      IF r.paid_amount=0 AND r.total_amount>0 AND r.account_id IS NOT NULL THEN
        INSERT INTO public.ticket_fund_entries(reservation_id,account_id,direction,amount,reference,actor_id)
          VALUES(r.id,r.account_id,'deposit',amount,reference,auth.uid());
      END IF;
      UPDATE public.ticket_reservations SET paid_amount=amount,status='approved',approved_at=now(),version=version+1 WHERE id=r.id;

    ELSIF p_action='revoke_approval' THEN
      IF r.status<>'approved' OR r.cancellation_requested_at IS NOT NULL THEN
        RAISE EXCEPTION '입금 확인을 취소할 수 있는 상태가 아닙니다.' USING ERRCODE='22023';
      END IF;
      DELETE FROM public.ticket_fund_entries WHERE reservation_id=r.id AND direction='deposit';
      DELETE FROM public.notifications
        WHERE user_id=r.user_id
          AND event_type='ticket_reservation'
          AND (event_key LIKE r.id::text || ':approved:%' OR event_key LIKE r.id::text || ':check_in:%');
      UPDATE public.ticket_reservations
        SET status='awaiting_payment', paid_amount=0, approved_at=NULL, admitted_quantity=0, checked_in_at=NULL, version=version+1
        WHERE id=r.id;
      reason := coalesce(nullif(reason, ''), '입금 확인 취소');

    ELSIF p_action='cancelled' THEN
      reason := coalesce(nullif(reason, ''), nullif(r.cancellation_reason, ''), '관리자 예매 취소 처리');
      UPDATE public.ticket_reservations
        SET status='cancelled',
            cancellation_reason=reason,
            refund_amount=0,
            refund_status=CASE WHEN r.refund_status='completed' THEN 'completed' ELSE 'none' END,
            admitted_quantity=0,
            checked_in_at=NULL,
            version=version+1
        WHERE id=r.id;

    ELSIF p_action='cancel_rejected' THEN
      IF r.cancellation_requested_at IS NULL OR r.status='cancelled' THEN RAISE EXCEPTION '검토 중인 환불/취소 요청이 없습니다.' USING ERRCODE='22023'; END IF;
      reason := coalesce(nullif(reason, ''), '환불/취소 요청 반려');
      UPDATE public.ticket_reservations SET cancellation_requested_at=NULL,refund_status='none',refund_bank=NULL,
        refund_account=NULL,refund_holder=NULL,version=version+1 WHERE id=r.id;

    ELSIF p_action='refund_completed' THEN
      amount := CASE WHEN r.paid_amount > 0 THEN r.paid_amount ELSE r.total_amount END;
      reason := coalesce(nullif(reason, ''), nullif(r.cancellation_reason, ''), '환불 완료 처리');
      IF reference = '' THEN
        reference := 'AUTO-REFUND-' || r.id::text || '-v' || r.version::text;
      END IF;
      IF amount > 0 AND r.account_id IS NOT NULL THEN
        INSERT INTO public.ticket_fund_entries(reservation_id,account_id,direction,amount,reference,actor_id)
          VALUES(r.id,r.account_id,'refund',amount,reference,auth.uid())
          ON CONFLICT DO NOTHING;
      END IF;
      UPDATE public.ticket_reservations
        SET status='cancelled',
            cancellation_reason=reason,
            refund_amount=amount,
            refund_status='completed',
            admitted_quantity=0,
            checked_in_at=NULL,
            version=version+1
        WHERE id=r.id;

    ELSIF p_action='restore_reservation' THEN
      IF r.status<>'cancelled' AND r.cancellation_requested_at IS NULL THEN
        RAISE EXCEPTION '복구할 취소·환불 상태가 아닙니다.' USING ERRCODE='22023';
      END IF;
      DELETE FROM public.ticket_fund_entries WHERE reservation_id=r.id AND direction='refund';
      UPDATE public.ticket_reservations
        SET status=CASE WHEN r.paid_amount > 0 AND r.approved_at IS NOT NULL THEN 'approved' ELSE 'awaiting_payment' END,
            cancellation_requested_at=NULL,
            refund_status='none',
            refund_amount=0,
            version=version+1
        WHERE id=r.id;
      reason := coalesce(nullif(reason, ''), '취소·환불 처리 취소');

    ELSIF p_action='check_in' THEN
      count_in := coalesce((p_payload->>'quantity')::integer, r.quantity - r.admitted_quantity);
      IF r.status<>'approved' OR r.cancellation_requested_at IS NOT NULL OR count_in IS NULL OR count_in<1
        OR count_in>r.quantity-r.admitted_quantity THEN RAISE EXCEPTION '승인 상태와 남은 입장 매수를 확인해 주세요.' USING ERRCODE='22023'; END IF;
      UPDATE public.ticket_reservations
        SET admitted_quantity=admitted_quantity+count_in,
            checked_in_at=now(),
            version=version+1
        WHERE id=r.id;
      reason := count_in::text || '명 입장';

    ELSIF p_action='undo_check_in' THEN
      IF r.status<>'approved' OR r.admitted_quantity<=0 THEN
        RAISE EXCEPTION '입장 확인을 취소할 수 있는 상태가 아닙니다.' USING ERRCODE='22023';
      END IF;
      DELETE FROM public.notifications
        WHERE user_id=r.user_id
          AND event_type='ticket_reservation'
          AND event_key LIKE r.id::text || ':check_in:%';
      UPDATE public.ticket_reservations
        SET admitted_quantity=0, checked_in_at=NULL, version=version+1
        WHERE id=r.id;
      reason := coalesce(nullif(reason, ''), '입장 확인 취소');

    ELSE
      RAISE EXCEPTION '지원하지 않는 처리입니다.' USING ERRCODE='22023';
    END IF;
  END IF;

  PERFORM public.ticket_notify(r.id, p_action, reason);
END;
$$;
REVOKE ALL ON FUNCTION public.update_ticket_reservation(uuid, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_ticket_reservation(uuid, integer, text, jsonb) TO authenticated;

COMMIT;
