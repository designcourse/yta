const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function checkChannel() {
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
      .select('*, google_accounts(*)')
      .eq('id', '12a6cfb4-6488-4193-aebf-1a016308dbdb')
      .single();

    if (channelError) {
      console.error('Channel error:', channelError);
      return;
    }

    console.log('Channel data:', JSON.stringify(channel, null, 2));

    // Also check if there are any google_accounts
    const { data: accounts, error: accountsError } = await supabase
      .from('google_accounts')
      .select('*')
      .limit(5);

    console.log('Google accounts:', JSON.stringify(accounts, null, 2));

  } catch (error) {
    console.error('Error:', error);
  }
}

checkChannel();
