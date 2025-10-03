-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create database function to call the collection endpoint
CREATE OR REPLACE FUNCTION public.trigger_early_metrics_collection()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  response_data jsonb;
  request_id bigint;
BEGIN
  -- Make HTTP POST request to the collection endpoint
  -- Replace YOUR_APP_URL with your actual Next.js deployment URL
  SELECT INTO request_id net.http_post(
    url := 'https://YOUR_APP_URL.vercel.app/api/early-metrics/collect',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.cron_secret', true)
    ),
    body := '{}'::jsonb
  );

  -- Log the request
  INSERT INTO public.cron_logs (function_name, request_id, executed_at)
  VALUES ('trigger_early_metrics_collection', request_id, now());

  RETURN jsonb_build_object('request_id', request_id, 'status', 'triggered');
EXCEPTION
  WHEN OTHERS THEN
    -- Log errors
    INSERT INTO public.cron_logs (function_name, error_message, executed_at)
    VALUES ('trigger_early_metrics_collection', SQLERRM, now());
    
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;

-- Create cron_logs table to track executions
CREATE TABLE IF NOT EXISTS public.cron_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  request_id bigint,
  error_message text,
  executed_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on cron_logs (only admins can view)
ALTER TABLE public.cron_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view cron logs"
  ON public.cron_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admins WHERE admins.user_id = auth.uid()
    )
  );

-- Schedule the cron job to run every 10 minutes
-- This will be executed by Supabase's cron scheduler
SELECT cron.schedule(
  'early-metrics-collection',       -- Job name
  '*/10 * * * *',                   -- Every 10 minutes (same as Vercel)
  $$SELECT public.trigger_early_metrics_collection();$$
);

-- Grant execute permission to postgres role
GRANT EXECUTE ON FUNCTION public.trigger_early_metrics_collection() TO postgres;

-- View all scheduled cron jobs
-- SELECT * FROM cron.job;

-- View cron job run history
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 100;

-- Manually trigger the function for testing
-- SELECT public.trigger_early_metrics_collection();

-- Delete the cron job (if needed)
-- SELECT cron.unschedule('early-metrics-collection');




