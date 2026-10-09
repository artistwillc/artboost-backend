-- DRAFT ONLY. Do not apply to production before staging concurrency tests.
-- Versioned claim-token protocol; legacy functions remain unchanged.
-- A worker must retain the returned claim_token and supply it on finish.
-- An expired claim can be reclaimed, but a previous token cannot finalize it.
ALTER TABLE public.social_publish_attempts
  ADD COLUMN IF NOT EXISTS claim_token uuid;

CREATE OR REPLACE FUNCTION public.begin_social_publish_attempt_v2(
  p_idempotency_key text, p_user_id uuid, p_automation_id uuid,
  p_product_id text, p_platform text
)
RETURNS TABLE(action text, attempt_count integer, provider_result jsonb, claim_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_row public.social_publish_attempts%ROWTYPE;
BEGIN
  IF nullif(btrim(p_idempotency_key), '') IS NULL
     OR nullif(btrim(p_platform), '') IS NULL THEN
    RAISE EXCEPTION 'idempotency key and platform are required';
  END IF;

  INSERT INTO public.social_publish_attempts
    (idempotency_key, user_id, automation_id, product_id, platform,
     status, attempt_count, claimed_at, claim_expires_at, claim_token, updated_at)
  VALUES
    (p_idempotency_key, p_user_id, p_automation_id, p_product_id,
     lower(btrim(p_platform)), 'in_progress', 1,
     now(), clock_timestamp() + interval '5 minutes', gen_random_uuid(), now())
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING * INTO v_row;

  IF FOUND THEN
    RETURN QUERY SELECT 'claimed'::text, v_row.attempt_count,
                        v_row.provider_result, v_row.claim_token;
    RETURN;
  END IF;

  SELECT spa.* INTO STRICT v_row
  FROM public.social_publish_attempts spa
  WHERE spa.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF v_row.status = 'succeeded' THEN
    RETURN QUERY SELECT 'already_succeeded'::text, v_row.attempt_count,
                        v_row.provider_result, null::uuid;
    RETURN;
  END IF;

  IF v_row.status = 'in_progress' AND
     v_row.claim_expires_at IS NOT NULL AND v_row.claim_expires_at > clock_timestamp() THEN
    RETURN QUERY SELECT 'in_progress'::text, v_row.attempt_count,
                        v_row.provider_result, null::uuid;
    RETURN;
  END IF;

  UPDATE public.social_publish_attempts spa
  SET status = 'in_progress', attempt_count = spa.attempt_count + 1,
      claimed_at = now(), claim_expires_at = now() + interval '5 minutes',
      claim_token = gen_random_uuid(), updated_at = now()
  WHERE spa.idempotency_key = p_idempotency_key
  RETURNING spa.* INTO v_row;

  RETURN QUERY SELECT 'claimed'::text, v_row.attempt_count,
                      v_row.provider_result, v_row.claim_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_social_publish_attempt_v2(
  p_idempotency_key text, p_claim_token uuid, p_status text,
  p_provider_result jsonb DEFAULT NULL, p_error_message text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_count integer;
BEGIN
  IF p_claim_token IS NULL OR p_status NOT IN
     ('succeeded', 'retry_wait', 'failed_exhausted', 'failed_permanent') THEN
    RETURN false;
  END IF;

  UPDATE public.social_publish_attempts spa
  SET status = p_status,
      provider_result = coalesce(p_provider_result, spa.provider_result),
      error_message = p_error_message,
      completed_at = CASE WHEN p_status = 'succeeded' THEN now()
                          ELSE spa.completed_at END,
      claim_expires_at = NULL, claim_token = NULL, updated_at = now()
  WHERE spa.idempotency_key = p_idempotency_key
    AND spa.claim_token = p_claim_token
    AND spa.status = 'in_progress'
    AND spa.claim_expires_at > clock_timestamp();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_social_publish_attempt_v2(text,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_social_publish_attempt_v2(text,uuid,text,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_social_publish_attempt_v2(text,uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_social_publish_attempt_v2(text,uuid,text,jsonb,text) TO service_role;
-- Staging validation required before applying this draft.
