-- ALTERNATIVE APPROACH: Pure database-driven collection
-- This approach processes early metrics entirely in the database without HTTP calls
-- More efficient but requires replicating the YouTube API logic in SQL

-- Create function to process a single video's early metrics
CREATE OR REPLACE FUNCTION public.process_early_metrics_item(
  p_metric_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_metric record;
  v_google_account record;
  v_access_token text;
  v_result jsonb;
BEGIN
  -- Fetch the pending metric
  SELECT * INTO v_metric
  FROM public.video_early_metrics
  WHERE id = p_metric_id
    AND status = 'pending'
    AND scheduled_for <= now()
  FOR UPDATE SKIP LOCKED; -- Prevent concurrent processing

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'not found or already processing');
  END IF;

  -- Get user's access token
  SELECT ga.access_token INTO v_access_token
  FROM public.channels c
  JOIN public.google_accounts ga ON ga.user_id = c.user_id
  WHERE c.channel_id = v_metric.channel_id
    AND c.user_id = v_metric.user_id
  LIMIT 1;

  IF v_access_token IS NULL THEN
    UPDATE public.video_early_metrics
    SET status = 'failed',
        error_message = 'No access token found',
        updated_at = now()
    WHERE id = p_metric_id;
    
    RETURN jsonb_build_object('status', 'failed', 'reason', 'no access token');
  END IF;

  -- Make HTTP request to YouTube Data API using pg_net
  -- Note: This requires the pg_net extension
  DECLARE
    request_id bigint;
    youtube_response jsonb;
  BEGIN
    SELECT INTO request_id net.http_get(
      url := 'https://www.googleapis.com/youtube/v3/videos?part=statistics&id=' || v_metric.video_id,
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_access_token,
        'Content-Type', 'application/json'
      )
    );

    -- In practice, you'd need to poll net.http_get_result() or use a webhook
    -- This is a simplified example - actual implementation would be more complex
    
    -- For production, it's better to keep the HTTP logic in Next.js
    -- and just trigger it from the database
    
    RETURN jsonb_build_object(
      'status', 'triggered',
      'request_id', request_id,
      'message', 'YouTube API call initiated'
    );
  END;

EXCEPTION
  WHEN OTHERS THEN
    UPDATE public.video_early_metrics
    SET status = 'failed',
        error_message = SQLERRM,
        updated_at = now()
    WHERE id = p_metric_id;
    
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;

-- Create batch processing function
CREATE OR REPLACE FUNCTION public.batch_process_early_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pending_count int;
  v_processed int := 0;
  v_metric_id uuid;
BEGIN
  -- Get count of pending items
  SELECT COUNT(*) INTO v_pending_count
  FROM public.video_early_metrics
  WHERE status = 'pending'
    AND scheduled_for <= now();

  -- Process up to 50 items
  FOR v_metric_id IN
    SELECT id FROM public.video_early_metrics
    WHERE status = 'pending'
      AND scheduled_for <= now()
    ORDER BY scheduled_for ASC
    LIMIT 50
  LOOP
    PERFORM public.process_early_metrics_item(v_metric_id);
    v_processed := v_processed + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'pending_count', v_pending_count,
    'processed', v_processed,
    'timestamp', now()
  );
END;
$$;

-- NOTE: This alternative approach is more complex and requires handling
-- async HTTP responses from pg_net. The recommended approach is to use
-- the HTTP trigger method in the main migration file.



