# Early Metrics System Architecture

## Problem Solved
Creators need to know how their videos perform in the critical first 3 hours, but if they don't log in immediately after uploading, we'd miss capturing that snapshot.

## Two-Tier Solution

### 🔍 Tier 1: Proactive Channel Polling (New!)
**Cron Schedule:** Every hour at :00  
**Purpose:** Discover new videos automatically, even if creator never logs in

**How it works:**
1. Cron runs hourly: `SELECT public.trigger_channel_polling();`
2. Calls API: `POST /api/channel-polling/check-new-videos`
3. Loops through all active subscriptions
4. Checks each channel's latest video via YouTube API
5. If new video found:
   - **< 3h old:** Schedules for 3h collection (status: `pending`)
   - **> 3h old:** Collects immediately as "late capture" (status: `collected` with note)

**Benefits:**
- ✅ Catches uploads within 1 hour, well before 3h mark
- ✅ Works even if creator never logs in
- ✅ Backfills old videos with disclaimer
- ✅ Only runs for paying subscribers

**API Quota Cost:**
- 2 units per channel per hour (channels.list + playlistItems.list)
- 100 active subs = 4,800 units/day (well within 10k daily quota)

---

### ⚡ Tier 2: Metrics Collection
**Cron Schedule:** Every 10 minutes  
**Purpose:** Collect stats for videos that reached their 3h mark

**How it works:**
1. Cron runs every 10 min: `SELECT public.trigger_early_metrics_collection();`
2. Calls API: `POST /api/early-metrics/collect`
3. Finds pending collections where `scheduled_for <= now()`
4. Fetches YouTube stats (views, likes, comments)
5. Updates status to `collected` with metrics

**Benefits:**
- ✅ Processes max 50 videos per run (scalable)
- ✅ Captures within 10 min of 3h mark
- ✅ Handles errors gracefully (marks as `failed`)

---

## Database Schema

### `video_early_metrics`
```sql
CREATE TABLE video_early_metrics (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  channel_id text NOT NULL,  -- YouTube channel ID
  video_id text NOT NULL,
  video_title text,
  published_at timestamptz NOT NULL,
  scheduled_for timestamptz NOT NULL,  -- published_at + 3h
  status text CHECK (status IN ('pending', 'collected', 'failed')),
  
  -- Collected metrics (null until collected)
  views_3h int,
  likes_3h int,
  comments_3h int,
  estimated_minutes_watched_3h numeric,
  subscribers_gained_3h int,
  
  collected_at timestamptz,
  error_message text,  -- Also used for "late capture" notes
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(user_id, channel_id, video_id)
);
```

---

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Creator uploads video to YouTube at 1:00 PM                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  OPTION A: Creator logs in before 4:00 PM                   │
│  ─────────────────────────────────────────────────────────  │
│  1. Visits /latest-video                                    │
│  2. System detects new video                                │
│  3. Inserts: status='pending', scheduled_for='4:00 PM'      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  OPTION B: Creator doesn't log in (NEW SOLUTION!)           │
│  ─────────────────────────────────────────────────────────  │
│  1. Hourly cron checks channel (runs at 2:00 PM)            │
│  2. Discovers new video uploaded at 1:00 PM                 │
│  3. Inserts: status='pending', scheduled_for='4:00 PM'      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Collection Cron runs at 4:00 PM, 4:10 PM, etc.             │
│  ─────────────────────────────────────────────────────────  │
│  1. Finds pending record with scheduled_for <= now()         │
│  2. Fetches YouTube stats via API                           │
│  3. Updates: status='collected', views_3h=1234, etc.        │
│  4. Sets collected_at timestamp                             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Creator logs in anytime (even days later)                  │
│  ─────────────────────────────────────────────────────────  │
│  1. Visits /latest-video                                    │
│  2. Sees EarlyMetricsCard with collected 3h snapshot        │
│  3. Progress bar shows "Unlocked!"                          │
│  4. Can compare to historical 3h baselines                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Edge Cases Handled

### 1. Late Discovery (Video > 3h old)
**Scenario:** Polling discovers video 6 hours after upload  
**Solution:** Collect current stats immediately, mark as "late capture" in `error_message`  
**UI:** Show disclaimer: "⚠️ Captured after 3h mark - use as approximate baseline"

### 2. Multiple Channels Per User
**Scenario:** User has 3 YouTube channels, all with active subs  
**Solution:** Polling checks all 3 channels, schedules collections independently

### 3. API Rate Limits
**Scenario:** 1,000 active subscriptions = high API usage  
**Solution:** 
- Polling runs hourly (not every 10 min) to reduce quota
- Only checks latest video (not full history)
- Batch processing with error handling

### 4. Subscription Expires Mid-Collection
**Scenario:** Sub expires between scheduling and collection  
**Solution:** Collection proceeds (already scheduled), but no new videos scheduled

### 5. Creator Deletes Video Before 3h
**Scenario:** Video unpublished before collection  
**Solution:** Collection marks as `failed` with error message

---

## Monitoring Queries

### Check both cron jobs
```sql
SELECT jobid, jobname, schedule, active 
FROM cron.job 
WHERE jobname IN ('channel-polling-hourly', 'early-metrics-collection')
ORDER BY jobname;
```

### Recent polling activity
```sql
SELECT * FROM cron_logs 
WHERE function_name = 'trigger_channel_polling'
ORDER BY executed_at DESC 
LIMIT 10;
```

### Pending collections
```sql
SELECT 
  video_id,
  video_title,
  scheduled_for,
  EXTRACT(EPOCH FROM (scheduled_for - now()))/3600 as hours_until
FROM video_early_metrics
WHERE status = 'pending'
ORDER BY scheduled_for;
```

### Success rate last 7 days
```sql
SELECT 
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 1) as percent
FROM video_early_metrics
WHERE created_at >= now() - interval '7 days'
GROUP BY status;
```

### Late captures (backfilled)
```sql
SELECT 
  video_id,
  video_title,
  published_at,
  collected_at,
  EXTRACT(EPOCH FROM (collected_at - published_at))/3600 as hours_late
FROM video_early_metrics
WHERE error_message LIKE '%Late capture%'
ORDER BY published_at DESC;
```

---

## API Quota Management

### Current Usage Estimate
- **Polling (hourly):**
  - channels.list: 1 unit
  - playlistItems.list: 1 unit
  - videos.list (if backfill): 1 unit
  - Total: ~2-3 units per channel per hour = 48-72 units/day/channel

- **Collection (every 10 min):**
  - videos.list: 1 unit per video
  - Total: 1 unit per video at 3h mark

- **Daily Total (100 subs, 3 uploads/day):**
  - Polling: 100 × 72 = 7,200 units
  - Collection: 3 × 1 = 3 units
  - Grand total: ~7,203 / 10,000 daily quota = 72% usage

### Optimization Strategies
1. Cache channel's last video ID, only fetch if changed
2. Adjust polling frequency based on channel upload patterns
3. Batch API calls where possible
4. Implement exponential backoff for rate limit errors

---

## Configuration

### Supabase Cron Jobs
```sql
-- Polling (hourly)
SELECT cron.schedule(
  'channel-polling-hourly',
  '0 * * * *',
  $$SELECT public.trigger_channel_polling();$$
);

-- Collection (every 10 min)
SELECT cron.schedule(
  'early-metrics-collection',
  '*/10 * * * *',
  $$SELECT public.trigger_early_metrics_collection();$$
);
```

### Environment Variables
```bash
CRON_SECRET=your-secret-here
```

### Config Table
```sql
SELECT * FROM cron_config;
-- app_url: https://your-app.vercel.app
-- cron_secret: your-secret-here
```

---

## Testing

### Manual trigger polling
```bash
curl -X POST https://your-app.vercel.app/api/channel-polling/check-new-videos \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json"
```

### Manual trigger collection
```bash
curl -X POST https://your-app.vercel.app/api/early-metrics/collect \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json"
```

### Test with ngrok (local dev)
```bash
ngrok http 3000

# Update config
UPDATE cron_config 
SET value = 'https://abc123.ngrok-free.app' 
WHERE key = 'app_url';
```

---

## Future Enhancements

1. **Smart Polling Frequency**
   - High-volume channels: check every 30 min
   - Low-volume channels: check every 6 hours

2. **Predictive Scheduling**
   - Learn creator's typical upload times
   - Poll more frequently during expected windows

3. **Multi-Window Snapshots**
   - 1h, 3h, 6h, 24h, 48h snapshots
   - Track velocity curves

4. **Anomaly Detection**
   - Alert if 3h performance is 50%+ below baseline
   - Suggest packaging rescue strategies

5. **Historical Comparison**
   - "Your 3h views are 85% higher than your 30-day average"
   - Benchmark against competitor 3h performance



