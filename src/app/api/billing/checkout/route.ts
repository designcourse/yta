import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { getStripeClient } from '@/utils/stripe';

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { channelId, plan } = await request.json();
    if (!channelId || !plan || !['monthly','yearly'].includes(String(plan))) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();

    // Ensure customer
    const { data: existing } = await admin
      .from('channel_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('channel_id', channelId)
      .maybeSingle();

    const stripe = getStripeClient();

    let customerId = existing?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        metadata: { user_id: user.id, channel_id: channelId },
      });
      customerId = customer.id;
    }

    const priceId = plan === 'monthly' ? process.env.STRIPE_PRICE_MONTHLY : process.env.STRIPE_PRICE_YEARLY;
    if (!priceId) return NextResponse.json({ error: 'Missing Stripe price env' }, { status: 500 });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { user_id: user.id, channel_id: channelId, plan },
      },
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL || ''}/dashboard?channelId=${encodeURIComponent(channelId)}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL || ''}/collection?channelId=${encodeURIComponent(channelId)}`,
      metadata: { user_id: user.id, channel_id: channelId, plan },
    });

    // Upsert pending record
    await admin.from('channel_subscriptions').upsert({
      user_id: user.id,
      channel_id: channelId,
      stripe_customer_id: customerId,
      plan,
      status: 'incomplete',
    }, { onConflict: 'user_id,channel_id' });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}


