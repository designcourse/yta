// API integration test for notifications
// Run with: node tests/api/notifications.test.js
// Requires valid auth session in browser storage or API key

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

async function testNotificationsAPI() {
  console.log('Testing /api/notifications...');

  // Test 1: GET notifications (requires auth)
  try {
    const res = await fetch(`${BASE_URL}/api/notifications`);
    console.log('GET /api/notifications:', res.status);
    
    if (res.ok) {
      const data = await res.json();
      console.log('Notifications count:', data.notifications?.length || 0);
      
      // Test with channel filter
      if (data.notifications?.[0]?.channel_id) {
        const channelRes = await fetch(`${BASE_URL}/api/notifications?channelId=UCTestChannel`);
        console.log('GET with channelId:', channelRes.status);
      }
    }
  } catch (e) {
    console.log('GET test failed:', e.message);
  }

  // Test 2: POST mark_read (requires notification ID)
  try {
    const postRes = await fetch(`${BASE_URL}/api/notifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        id: 'test-notification-id', 
        action: 'mark_read' 
      })
    });
    console.log('POST mark_read:', postRes.status);
  } catch (e) {
    console.log('POST test failed:', e.message);
  }

  console.log('API tests complete');
}

// Run if called directly
if (require.main === module) {
  testNotificationsAPI();
}

module.exports = { testNotificationsAPI };
