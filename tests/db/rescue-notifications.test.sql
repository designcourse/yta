-- Test rescue notification function directly
-- This can be run in Supabase SQL Editor or via pgTAP

BEGIN;

-- Setup test data
INSERT INTO auth.users (id, email) VALUES ('test-user-1', 'test@example.com');
INSERT INTO public.channels (id, user_id, channel_id, title) VALUES 
  ('test-channel-1', 'test-user-1', 'UCTestChannel', 'Test Channel');

-- Insert a recent video snapshot (published 1.5 hours ago)
INSERT INTO public.latest_video_snapshots (
  channel_id, user_id, video_id, video_title, view_count, 
  published_at, stats_retrieved_at
) VALUES (
  'test-channel-1', 'test-user-1', 'test-video-1', 'Test Video',
  100, -- 100 views
  NOW() - INTERVAL '1.5 hours', -- published 1.5h ago
  NOW()
);

-- Insert comparable video metrics (higher baseline)
INSERT INTO public.video_metrics (
  user_id, channel_id, video_id, views_per_day, avg_view_duration_sec,
  is_short, length_band, topic_cluster, date
) VALUES 
  ('test-user-1', 'UCTestChannel', 'baseline-1', 2400, 120, false, '6-9min', 'tech', CURRENT_DATE), -- 100 VPH baseline
  ('test-user-1', 'UCTestChannel', 'baseline-2', 3600, 110, false, '6-9min', 'tech', CURRENT_DATE), -- 150 VPH baseline
  ('test-user-1', 'UCTestChannel', 'baseline-3', 1200, 130, false, '6-9min', 'tech', CURRENT_DATE); -- 50 VPH baseline

-- P25 of [50, 100, 150] = 75 VPH, so 75/24 = ~3.125 VPH threshold
-- Current video: 100 views / 1.5 hours = 66.67 VPH (should trigger rescue)

-- Run the rescue function
SELECT public.enqueue_rescue_notifications();

-- Verify notification was created
SELECT 
  type, title, 
  metadata->>'video_id' as video_id,
  (metadata->>'vph')::numeric as vph,
  (metadata->>'vph_p25')::numeric as vph_p25
FROM public.notifications 
WHERE user_id = 'test-user-1' AND type = 'rescue_prompt';

-- Expected: 1 row with vph ~66.67, vph_p25 ~3.125

ROLLBACK;
