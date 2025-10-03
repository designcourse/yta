# Deploying Early Metrics Cron to Supabase

## Overview
Instead of using Vercel Cron, you can use Supabase's native **pg_cron** extension to schedule the early metrics collection job directly from your database.

## Setup Instructions

### Option 1: HTTP Trigger (Recommended)

This approach uses Supabase pg_cron to call your Next.js API endpoint every 10 minutes.

#### 1. Run the Migration

```bash
# Apply the Supabase migration
supabase db push supabase/migrations/20250929_early_metrics_cron.sql
```

Or run it directly in **Supabase SQL Editor**:

```sql
-- Copy contents of supabase/migrations/20250929_early_metrics_cron.sql
-- and execute in SQL Editor
```

#### 2. Set Database Secret

In **Supabase Dashboard → Project Settings → Vault**:

1. Create a new secret called `cron_secret`
2. Set value to your `CRON_SECRET` (same as in `.env`)
3. Save

Or via SQL:

```sql
-- Store the cron secret in Supabase Vault
SELECT vault.create_secret(
  'your-random-32-char-secret',
  'cron_secret',
  'Secret for authenticating cron job requests'
);
```

#### 3. Update Migration with Your URL

Edit the migration file and replace:
```sql
url := 'https://YOUR_APP_URL.vercel.app/api/early-metrics/collect',
```

With your actual deployment URL:
```sql
url := 'https://your-app.vercel.app/api/early-metrics/collect',
```

#### 4. Verify Cron Job

```sql
-- View all scheduled cron jobs
SELECT * FROM cron.job WHERE jobname = 'early-metrics-collection';

-- View recent executions
SELECT * 
FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'early-metrics-collection')
ORDER BY start_time DESC 
LIMIT 10;

-- Check your custom logs
SELECT * FROM public.cron_logs ORDER BY executed_at DESC LIMIT 20;
```

#### 5. Manual Testing

```sql
-- Manually trigger the function to test
SELECT public.trigger_early_metrics_collection();
```

### Option 2: Supabase Edge Function (Alternative)

If you prefer Supabase Edge Functions over pg_cron:

#### 1. Install Supabase CLI

```bash
npm install -g supabase
supabase login
```

#### 2. Create Edge Function

```bash
supabase functions new early-metrics-collector
```

#### 3. Implement the Function

File: `supabase/functions/early-metrics-collector/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    // Verify cron secret
    const authHeader = req.headers.get('authorization');
    const expectedAuth = `Bearer ${Deno.env.get('CRON_SECRET')}`;
    
    if (authHeader !== expectedAuth) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Call your Next.js API endpoint
    const response = await fetch(
      `${Deno.env.get('NEXT_APP_URL')}/api/early-metrics/collect`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('CRON_SECRET')}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const result = await response.json();

    return new Response(
      JSON.stringify(result),
      { status: response.status, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
```

#### 4. Deploy Edge Function

```bash
supabase functions deploy early-metrics-collector
```

#### 5. Schedule with Supabase Cron

```sql
SELECT cron.schedule(
  'early-metrics-edge-function',
  '*/10 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://your-project.supabase.co/functions/v1/early-metrics-collector',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.cron_secret', true)
      )
    );
  $$
);
```

## Monitoring

### Check Cron Job Status

```sql
-- View job configuration
SELECT 
  jobid,
  jobname,
  schedule,
  command,
  active
FROM cron.job;

-- View execution history
SELECT 
  runid,
  jobid,
  job_name,
  status,
  return_message,
  start_time,
  end_time,
  (end_time - start_time) as duration
FROM cron.job_run_details
WHERE job_name = 'early-metrics-collection'
ORDER BY start_time DESC
LIMIT 50;

-- Check for failures
SELECT * 
FROM cron.job_run_details 
WHERE status = 'failed'
  AND job_name = 'early-metrics-collection'
ORDER BY start_time DESC;
```

### Monitor Collection Results

```sql
-- Check pending collections
SELECT 
  video_id,
  video_title,
  scheduled_for,
  EXTRACT(EPOCH FROM (now() - scheduled_for))/3600 as hours_overdue
FROM video_early_metrics
WHERE status = 'pending'
  AND scheduled_for <= now()
ORDER BY scheduled_for;

-- Collection success rate (last 7 days)
SELECT 
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM video_early_metrics
WHERE created_at >= now() - interval '7 days'
GROUP BY status;
```

## Troubleshooting

### Cron Not Running

```sql
-- Check if pg_cron extension is enabled
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- If not enabled:
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Verify job is active
SELECT * FROM cron.job WHERE jobname = 'early-metrics-collection';

-- If inactive, recreate:
SELECT cron.unschedule('early-metrics-collection');
SELECT cron.schedule(
  'early-metrics-collection',
  '*/10 * * * *',
  $$SELECT public.trigger_early_metrics_collection();$$
);
```

### HTTP Requests Failing

```sql
-- Check if pg_net extension is enabled
SELECT * FROM pg_extension WHERE extname = 'pg_net';

-- If not enabled:
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Test the trigger function manually
SELECT public.trigger_early_metrics_collection();

-- Check logs
SELECT * FROM public.cron_logs ORDER BY executed_at DESC LIMIT 10;
```

### Secret Not Found

```sql
-- Verify secret exists in Vault
SELECT name FROM vault.secrets WHERE name = 'cron_secret';

-- If missing, create it:
SELECT vault.create_secret(
  'your-secret-value',
  'cron_secret'
);

-- Grant access to function
GRANT USAGE ON SCHEMA vault TO postgres;
```

## Migration from Vercel Cron

If you're switching from Vercel Cron to Supabase:

1. **Keep both running initially** for redundancy
2. **Monitor Supabase cron** for 24-48 hours
3. **Verify collections** are happening on schedule
4. **Remove `vercel.json` cron config** once stable:

```json
{
  "crons": []  // Empty or remove file entirely
}
```

## Advantages of Supabase Cron

✅ **Native integration** with your database  
✅ **No external service** dependencies  
✅ **Built-in monitoring** via `cron.job_run_details`  
✅ **Consistent timezone** (database time)  
✅ **Direct database access** for the function  

## Costs

- **pg_cron**: Free on all Supabase plans
- **pg_net**: Free outbound requests (within reasonable limits)
- **Edge Functions**: Free tier includes 500K invocations/month

## Next Steps

1. Run the migration
2. Set the `cron_secret` in Vault
3. Update the URL in the trigger function
4. Monitor execution for 24 hours
5. Remove Vercel cron config if everything works




