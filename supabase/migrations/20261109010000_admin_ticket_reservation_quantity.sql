BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION public.update_ticket_reservation_quantity(
  p_id uuid, p_version integer, p_quantity integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  r public.ticket_reservations;
  capacity integer;
  held bigint;
  new_total numeric;
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() IS NOT TRUE THEN
    RAISE EXCEPTION '관리자만 처리할 수 있습니다.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r FROM public.ticket_reservations WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '예매를 찾을 수 없습니다.' USING ERRCODE = '22023';
  END IF;

  -- Keep the same lock order as reservation creation and check-in.
  SELECT ticket_capacity INTO capacity FROM public.gigs WHERE id = r.gig_id FOR UPDATE;
  SELECT * INTO STRICT r FROM public.ticket_reservations WHERE id = p_id FOR UPDATE;
  IF r.version IS DISTINCT FROM p_version THEN
    RAISE EXCEPTION '처리 상태가 변경되었습니다. 새로고침 후 다시 확인해 주세요.' USING ERRCODE = '22023';
  END IF;
  IF r.status = 'cancelled' OR r.cancellation_requested_at IS NOT NULL OR r.refund_status <> 'none' THEN
    RAISE EXCEPTION '취소·환불 중이거나 처리된 예매의 매수는 변경할 수 없습니다.' USING ERRCODE = '22023';
  END IF;
  IF p_quantity IS NULL OR p_quantity < greatest(1, r.admitted_quantity) OR p_quantity > 1000000 THEN
    RAISE EXCEPTION '이미 입장한 인원과 예매 매수를 확인해 주세요.' USING ERRCODE = '22023';
  END IF;
  IF p_quantity = r.quantity THEN RETURN; END IF;

  IF p_quantity > r.quantity THEN
    SELECT coalesce(sum(quantity), 0) INTO held
    FROM public.ticket_reservations WHERE gig_id = r.gig_id AND status <> 'cancelled';
    IF capacity IS NULL OR held + p_quantity - r.quantity > capacity THEN
      RAISE EXCEPTION '공연의 남은 예매 가능 매수를 확인해 주세요.' USING ERRCODE = '22023';
    END IF;
  END IF;

  new_total := r.unit_price::numeric * p_quantity;
  IF new_total > 9007199254740991 THEN
    RAISE EXCEPTION '변경 후 예매 금액이 너무 큽니다.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.ticket_reservations
    SET quantity = p_quantity, total_amount = new_total, version = version + 1
    WHERE id = r.id;
  INSERT INTO public.ticket_reservation_events (reservation_id, actor_id, action, detail)
    VALUES (r.id, auth.uid(), 'quantity_updated', format('%s매 → %s매', r.quantity, p_quantity));
END;
$$;
REVOKE ALL ON FUNCTION public.update_ticket_reservation_quantity(uuid, integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_ticket_reservation_quantity(uuid, integer, integer) TO authenticated;

COMMIT;
