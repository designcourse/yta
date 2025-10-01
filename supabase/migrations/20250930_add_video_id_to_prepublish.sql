-- Add video_id column to prepublish_videos table for linking to YouTube videos
ALTER TABLE prepublish_videos 
ADD COLUMN IF NOT EXISTS video_id text;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_prepublish_videos_video_id 
ON prepublish_videos(video_id);

-- Update RLS policies to support video_id (if they exist)
-- Note: This assumes RLS policies are already in place for plan_id

