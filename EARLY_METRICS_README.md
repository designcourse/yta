# Early Metrics Collection System (3-Hour Snapshots)

## Overview
Automatically tracks video performance 3 hours after upload for paying members. This creates a historical baseline of early performance metrics that helps creators understand their initial momentum.

## How It Works

### 1. Detection
When a user visits `/latest-video`:
- System checks if the video already has a 3h metrics record
- If not, calculates `published_at + 3 hours` as the collection time
- Only schedules for users with active subscriptions

### 2. Scheduling
- New record inserted into `video_early_metrics` table with status `'pending'`
- If 3h mark has already passed, metrics are collected immediately
- Records include: `user_id`, `channel_id`, `video_id`, `scheduled_for`

### 3. Collection (Cron Job)
- Vercel Cron runs `/api/early-metrics/collect` every 10 minutes
- Fetches all `pending` records where `scheduled_for <= now()`
- Processes up to 50 videos per run to avoid timeouts
- Collects metrics from YouTube Data API:
  - Views
  - Likes
  - Comments
  - Watch time (if available from Analytics API)
  - Subscribers gained (if available)

### 4. Display
- `EarlyMetricsCard` component shows on `/latest-video` page
- Three states:
  - **Pending**: Shows countdown to unlock time
  - **Collected**: Displays 5 key metrics with baseline context
  - **Failed**: Shows error message with retry capability

## Database Schema

```sql
CREATE TABLE video_early_metrics (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  channel_id text NOT NULL,
  video_id text NOT NULL,
  video_title text,
  published_at timestamptz NOT NULL,
  scheduled_for timestamptz NOT NULL, -- published_at + 3h
  status text CHECK (status IN ('pending', 'collected', 'failed')),
  
  -- Collected metrics
  views_3h int,
  likes_3h int,
  comments_3h int,
  estimated_minutes_watched_3h numeric,
  subscribers_gained_3h int,
  
  collected_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(user_id, channel_id, video_id)
);
```

## API Endpoints

### GET `/api/early-metrics`
Fetch early metrics for a specific video.

**Query Params:**
- `channelId` (required): YouTube channel ID
- `videoId` (required): YouTube video ID

**Response:**
```json
{
  "metrics": {
    "id": "uuid",
    "video_id": "abc123",
    "status": "collected",
    "views_3h": 1250,
    "likes_3h": 45,
    "comments_3h": 12,
    "estimated_minutes_watched_3h": 1850,
    "subscribers_gained_3h": 8,
    "collected_at": "2025-09-29T13:00:00Z"
  }
}
```

### POST `/api/early-metrics`
Manually schedule early metrics collection (rarely needed - auto-scheduled via `/latest-video`).

**Body:**
```json
{
  "channelId": "UCabc123",
  "videoId": "xyz789",
  "videoTitle": "My Video",
  "publishedAt": "2025-09-29T10:00:00Z"
}
```

### POST `/api/early-metrics/collect`
Cron job endpoint to process pending collections. Requires `CRON_SECRET` in Authorization header.

**Response:**
```json
{
  "message": "Collection complete",
  "processed": 15,
  "success": 14,
  "failed": 1,
  "errors": ["video_id: Error message"]
}
```

## Environment Variables

Add to `.env.local`:
```bash
# Cron job authentication (use a random 32-character string)
CRON_SECRET=your-random-secret-here
```

## Vercel Configuration

The `vercel.json` file configures the cron schedule:

```json
{
  "crons": [
    {
      "path": "/api/early-metrics/collect",
      "schedule": "*/10 * * * *"
    }
  ]
}
```

**Cron Expression:** `*/10 * * * *` = Every 10 minutes

## Use Cases

1. **Historical Baseline**: Build a database of 3h performance across all videos
2. **Early Momentum Indicator**: Compare current video to historical 3h average
3. **Rescue Opportunities**: Identify underperforming videos within the critical first few hours
4. **Algorithm Insights**: Track how YouTube's initial distribution affects early metrics

## Future Enhancements

- 24-hour snapshots (use YouTube Analytics for CTR/AVD)
- 48-hour snapshots (retention curves available)
- Automatic comparison to channel's 3h baseline
- Email/push notifications if video underperforms 3h baseline
- Historical trend charts showing 3h performance over time

## Testing

### Manual Testing
1. Upload a new video to your channel
2. Visit `/dashboard/[channelId]/latest-video`
3. Verify "Early Metrics" card appears with countdown
4. Wait for 3h mark (or test with an older video)
5. Manually trigger cron: `curl -X POST https://your-app.vercel.app/api/early-metrics/collect -H "Authorization: Bearer your-cron-secret"`

### Database Queries

Check pending collections:
```sql
SELECT video_id, video_title, scheduled_for, status
FROM video_early_metrics
WHERE status = 'pending'
ORDER BY scheduled_for;
```

Check collection success rate:
```sql
SELECT status, COUNT(*) as count
FROM video_early_metrics
GROUP BY status;
```

## Troubleshooting

**Metrics not collecting:**
- Check user has active subscription in `channel_subscriptions`
- Verify YouTube API quotas not exceeded
- Check logs in Vercel dashboard for cron job errors
- Confirm `CRON_SECRET` environment variable is set

**Failed collections:**
- Error stored in `error_message` field
- Common issues: token expiration, video deleted/privated, API rate limits
- Failed videos can be manually re-collected by updating status to 'pending'

## Monitoring

Watch for:
- High failure rate (> 10%)
- Cron job timeouts (processing > 50 videos)
- API quota consumption
- User complaints about missing 3h snapshots



