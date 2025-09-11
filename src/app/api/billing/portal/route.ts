import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { getStripeClient } from '@/utils/stripe';

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { subscriptionId } = await request.json();
    if (!subscriptionId) return NextResponse.json({ error: 'subscriptionId required' }, { status: 400 });

    const admin = createSupabaseAdminClient();
    const { data: sub } = await admin
      .from('channel_subscriptions')
      .select('stripe_customer_id, user_id')
      .eq('stripe_subscription_id', subscriptionId)
      .maybeSingle();

    if (!sub || sub.user_id !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (!sub.stripe_customer_id) {
      return NextResponse.json({ error: 'No customer ID found' }, { status: 400 });
    }

    const stripe = getStripeClient();
    
    console.log('Creating billing portal for customer:', sub.stripe_customer_id);
    const returnUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/billing`;
    console.log('Return URL:', returnUrl);
    
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id as string,
      return_url: returnUrl,
    });

    console.log('Portal created successfully:', portal.url);
    return NextResponse.json({ url: portal.url });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}


