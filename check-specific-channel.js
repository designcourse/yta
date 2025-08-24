const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function checkSpecificChannel() {
  try {
    // Read environment variables
    const env = {};
    fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) env[key.trim()] = value.trim();
    });

    console.log('Environment variables loaded');

    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // Check the specific channel
    const { data: channel, error: channelError } = await supabase
      .from('channels')
      .select('*')
      .eq('id', '70ec46c6-85f7-402a-930b-fdd1cba9c7bf')
      .single();

    if (channelError) {
      console.error('Channel error:', channelError);
      return;
    }

    console.log('Channel data:', JSON.stringify(channel, null, 2));

    // Check if there's a google account with the google_sub from the logs
    if (channel.google_sub) {
      console.log('Looking for Google account with google_sub:', channel.google_sub);
      const { data: googleAccount, error: googleError } = await supabase
        .from('google_accounts')
        .select('*')
        .eq('google_sub', channel.google_sub)
        .single();

      console.log('Google account result:', JSON.stringify(googleAccount, null, 2));
      if (googleError) console.error('Google account error:', googleError);
    } else {
      console.log('Channel has no google_sub value');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

checkSpecificChannel();
