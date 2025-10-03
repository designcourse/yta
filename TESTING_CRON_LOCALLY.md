# Testing Supabase Cron Job Locally

## The Problem
Supabase's cron job runs on their servers and can't reach `http://localhost:3000` on your machine.

## Solutions

### Option 1: Use ngrok (Recommended for Testing)

1. **Install ngrok**:
```bash
npm install -g ngrok
```

2. **Start your Next.js dev server**:
```bash
npm run dev
```

3. **Expose it with ngrok**:
```bash
ngrok http 3000
```

4. **Copy the HTTPS URL** (e.g., `https://abc123.ngrok-free.app`)

5. **Update Supabase config** (in SQL Editor):
```sql
UPDATE public.cron_config 
SET value = 'https://abc123.ngrok-free.app', updated_at = now()
WHERE key = 'app_url';
```

6. **Test it**:
```sql
SELECT public.trigger_early_metrics_collection();
```

### Option 2: Manual Testing (No Cron)

Test the collection logic directly without waiting for cron:

```bash
# With your dev server running:
curl -X POST http://localhost:3000/api/early-metrics/collect \
  -H "Authorization: Bearer SVlMLzuHoYFC3ombp5EEL5x6so3hplA2" \
  -H "Content-Type: application/json"
```

Or use the API testing route in your browser dev tools:
```javascript
fetch('/api/early-metrics/collect', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer SVlMLzuHoYFC3ombp5EEL5x6so3hplA2',
    'Content-Type': 'application/json'
  }
}).then(r => r.json()).then(console.log);
```

### Option 3: Deploy to Vercel (Production)

When you're ready to deploy:

1. **Deploy to Vercel**:
```bash
vercel deploy --prod
```

2. **Get your production URL** (e.g., `https://yt.vercel.app`)

3. **Update config** (in Supabase SQL Editor):
```sql
UPDATE public.cron_config 
SET value = 'https://yt.vercel.app', updated_at = now()
WHERE key = 'app_url';

-- Verify
SELECT * FROM public.cron_config;
```

4. **Cron will automatically work** every 10 minutes!

## Monitoring

### Check if cron is running:
```sql
-- View scheduled jobs
SELECT * FROM cron.job WHERE jobname = 'early-metrics-collection';

-- View execution history
SELECT * FROM cron.job_run_details 
WHERE jobid = 2 
ORDER BY start_time DESC 
LIMIT 10;

-- View your custom logs
SELECT * FROM public.cron_logs 
ORDER BY executed_at DESC 
LIMIT 10;
```

### Check early metrics being processed:
```sql
-- Pending collections
SELECT 
  video_id,
  video_title,
  scheduled_for,
  status,
  EXTRACT(EPOCH FROM (scheduled_for - now()))/3600 as hours_until
FROM video_early_metrics 
WHERE status = 'pending'
ORDER BY scheduled_for;

-- Success rate
SELECT 
  status, 
  COUNT(*) as count 
FROM video_early_metrics 
GROUP BY status;
```

## Current Configuration

```sql
SELECT * FROM public.cron_config;
```

Current values:
- **app_url**: `http://localhost:3000`
- **cron_secret**: `SVlMLzuHoYFC3ombp5EEL5x6so3hplA2`

**Note**: Update `app_url` to a publicly accessible URL for the cron job to work!




