BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

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

  IF p_action IN ('revoke_approval', 'undo_check_in') THEN
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
  refunded bigint;
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
      amount := coalesce((p_payload->>'amount')::bigint, r.total_amount);
      IF reference = '' THEN
        reference := 'AUTO-APPROVE-' || r.id::text || '-v' || r.version::text;
      END IF;
      IF amount IS DISTINCT FROM r.total_amount THEN RAISE EXCEPTION '실입금액과 예매 금액이 일치해야 합니다.' USING ERRCODE='22023'; END IF;
      IF r.paid_amount=0 AND r.total_amount>0 AND r.account_id IS NOT NULL THEN
        INSERT INTO public.ticket_fund_entries(reservation_id,account_id,direction,amount,reference,actor_id)
          VALUES(r.id,r.account_id,'deposit',amount,reference,auth.uid());
      ELSIF r.paid_amount<>0 AND r.paid_amount<>amount THEN
        RAISE EXCEPTION '기록된 입금액이 예매 금액과 다릅니다. 입금 내역을 먼저 확인해 주세요.' USING ERRCODE='22023';
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
        SET status='awaiting_payment', paid_amount=0, approved_at=NULL, admitted_quantity=0, version=version+1
        WHERE id=r.id;
      reason := coalesce(nullif(reason, ''), '입금 확인 취소 (되돌리기)');

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
      IF r.status<>'cancelled' OR r.refund_status<>'processing' THEN RAISE EXCEPTION '환불 처리 중인 예매가 아닙니다.' USING ERRCODE='22023'; END IF;
      IF reference = '' THEN
        reference := 'AUTO-REFUND-' || r.id::text || '-v' || r.version::text;
      END IF;
      INSERT INTO public.ticket_fund_entries(reservation_id,account_id,direction,amount,reference,actor_id)
        VALUES(r.id,r.account_id,'refund',r.refund_amount,reference,auth.uid());
      UPDATE public.ticket_reservations SET refund_status='completed',version=version+1 WHERE id=r.id;

    ELSIF p_action='check_in' THEN
      count_in := coalesce((p_payload->>'quantity')::integer, r.quantity - r.admitted_quantity);
      IF r.status<>'approved' OR r.cancellation_requested_at IS NOT NULL OR count_in IS NULL OR count_in<1
        OR count_in>r.quantity-r.admitted_quantity THEN RAISE EXCEPTION '승인 상태와 남은 입장 매수를 확인해 주세요.' USING ERRCODE='22023'; END IF;
      UPDATE public.ticket_reservations SET admitted_quantity=admitted_quantity+count_in,version=version+1 WHERE id=r.id;
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
        SET admitted_quantity=0, version=version+1
        WHERE id=r.id;
      reason := coalesce(nullif(reason, ''), '입장 확인 취소 (되돌리기)');

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
