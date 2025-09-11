import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { getStripeClient } from '@/utils/stripe';

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { subscriptionId, reason } = await request.json();
    if (!subscriptionId || typeof reason !== 'string') return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

    const admin = createSupabaseAdminClient();

    // Look up subscription record to confirm ownership and gather details
    const { data: sub } = await admin
      .from('channel_subscriptions')
      .select('user_id, channel_id, stripe_subscription_id, stripe_customer_id, plan, status, created_at')
      .eq('stripe_subscription_id', subscriptionId)
      .maybeSingle();

    if (!sub || sub.user_id !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Get the actual channel UUID from the channels table (sub.channel_id is YouTube channel ID, need to get the UUID)
    const { data: channelData } = await admin
      .from('channels')
      .select('id')
      .eq('channel_id', sub.channel_id)  // Match on YouTube channel ID
      .maybeSingle();

    if (!channelData) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    const stripe = getStripeClient();

    // Retrieve subscription from Stripe to compute revenue and tenure
    const stripeSub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['latest_invoice', 'plan', 'items'] });

    // Compute tenure (days between created_at and now)
    const startedAtIso = sub.created_at || (stripeSub.created ? new Date(stripeSub.created * 1000).toISOString() : null);
    const startedAt = startedAtIso ? new Date(startedAtIso).getTime() : Date.now();
    const tenureDays = Math.max(0, Math.round((Date.now() - startedAt) / (1000 * 60 * 60 * 24)));

    // Compute total revenue from Stripe invoices for this subscription
    let totalRevenueCents = 0;
    const invoices = await stripe.invoices.list({ subscription: subscriptionId, limit: 100 });
    for (const inv of invoices.data) {
      if (inv.status === 'paid') {
        totalRevenueCents += inv.amount_paid || 0;
      }
    }

    // Cancel at period end (do not immediately mark canceled; webhook will update status)
    await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });

    // Record cancellation reason/details
    const { error: insertError } = await admin.from('subscription_cancellations').insert({
      user_id: user.id,
      channel_id: channelData.id,
      stripe_subscription_id: subscriptionId,
      reason,
      tenure_days: tenureDays,
      total_revenue_cents: totalRevenueCents,
    });
    
    if (insertError) {
      console.error('Error inserting cancellation record:', insertError);
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}


