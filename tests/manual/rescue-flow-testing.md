# Manual Testing Guide: Notifications & Rescue Flow

## Prerequisites
- Running Next.js dev server (`npm run dev`)
- Authenticated user with at least one YouTube channel connected
- Access to Supabase dashboard for database inspection

## Test Scenarios

### 1. Database Function Testing

**Test the rescue notification function directly:**

1. Open Supabase SQL Editor
2. Run the test SQL from `tests/db/rescue-notifications.test.sql`
3. Verify notifications are created with correct metadata
4. Check that duplicate notifications are prevented (run twice)

**Expected Results:**
- Function executes without errors
- Notifications table shows rescue_prompt entries
- Metadata contains vph, vph_p25, hours_since values
- No duplicates on second run

### 2. Cron Job Testing

**Verify pg_cron scheduling:**

1. In Supabase SQL Editor, check cron jobs:
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'enqueue_rescue_notifications_hourly';
   ```

2. Manually trigger the job:
   ```sql
   SELECT public.enqueue_rescue_notifications();
   ```

3. Check notifications table for new entries:
   ```sql
   SELECT * FROM public.notifications WHERE type = 'rescue_prompt' ORDER BY created_at DESC;
   ```

**Expected Results:**
- Cron job exists with correct schedule ('10 * * * *')
- Manual execution creates notifications for qualifying videos
- Notifications have proper user_id and channel_id references

### 3. API Endpoint Testing

**Test /api/notifications endpoints:**

1. Open browser dev tools → Network tab
2. Navigate to dashboard with a channel selected
3. Check for `/api/notifications?channelId=...` requests
4. Verify response format and data

**Manual API calls (using browser console):**
```javascript
// Get notifications
fetch('/api/notifications?channelId=YOUR_CHANNEL_ID')
  .then(r => r.json())
  .then(console.log);

// Mark notification as read
fetch('/api/notifications', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: 'NOTIFICATION_ID', action: 'mark_read' })
}).then(r => r.json()).then(console.log);
```

**Expected Results:**
- GET returns array of notifications
- POST successfully marks notifications as read
- Proper error handling for invalid requests

### 4. UI Toast Testing

**Test notification toast display:**

1. Create a test notification in database:
   ```sql
   INSERT INTO public.notifications (user_id, channel_id, type, title, body, metadata)
   VALUES (
     'YOUR_USER_ID', 'YOUR_CHANNEL_UUID', 'rescue_prompt',
     'Test Rescue Notification',
     'This is a test notification for UI testing.',
     '{"video_id": "test", "vph": 45.2, "vph_p25": 52.1, "hours_since": 1.2}'::jsonb
   );
   ```

2. Navigate to dashboard
3. Verify toast appears at bottom center
4. Test both action buttons

**Expected Results:**
- Toast appears with correct styling and content
- "Open Next Experiment" button opens Neria and shows experiment panel
- "Dismiss" button hides toast and marks notification as read
- Toast respects reduced-motion preferences

### 5. Deep Link Testing

**Test Neria integration:**

1. Ensure Neria container is visible in dashboard
2. Trigger notification toast (from step 4)
3. Click "Open Next Experiment"
4. Verify Neria behavior

**Expected Results:**
- Neria unminimizes if minimized
- Neria switches to fullscreen mode for visibility
- Next Experiment panel is visible with current video data
- Custom event `open-next-experiment` is properly handled

### 6. Edge Cases Testing

**Test various edge conditions:**

1. **No notifications:** Verify no toast appears
2. **Multiple notifications:** Only first unread should show
3. **Network errors:** Toast should handle API failures gracefully
4. **Rapid clicking:** Prevent double-marking notifications
5. **Channel switching:** Toast should update for new channel context

### 7. Performance Testing

**Check polling behavior:**

1. Monitor network requests in dev tools
2. Verify notifications API is called every 60 seconds
3. Ensure no memory leaks from interval cleanup
4. Test with multiple dashboard tabs open

**Expected Results:**
- Consistent 60-second polling interval
- Proper cleanup on component unmount
- No excessive API calls or memory growth

## Debugging Tips

**Common issues and solutions:**

1. **No notifications appearing:**
   - Check user authentication status
   - Verify channel ownership in database
   - Ensure video metrics exist for comparison

2. **Cron job not running:**
   - Verify pg_cron extension is enabled
   - Check Supabase logs for execution errors
   - Confirm function has proper permissions

3. **Toast not showing:**
   - Check browser console for JavaScript errors
   - Verify notification data structure
   - Test with reduced motion settings

4. **Deep link not working:**
   - Ensure NeriaContext is properly set up
   - Check event listener registration
   - Verify Neria container state management

## Automated Testing

**Run the test suite:**

```bash
# Unit/API tests
node tests/api/notifications.test.js

# E2E tests
npm run test:login  # Includes notifications test

# Full test suite
npm run "test all"
```

**Expected Results:**
- All tests pass without errors
- Proper test coverage of critical paths
- Integration between components works end-to-end
