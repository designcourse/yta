import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { getStripeClient } from '@/utils/stripe';

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { channelId, plan, paymentMethodId } = await request.json();
    if (!channelId || !plan || !paymentMethodId || !['monthly','yearly'].includes(String(plan))) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const stripe = getStripeClient();

    // Get or create customer
    const { data: existing } = await admin
      .from('channel_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('channel_id', channelId)
      .maybeSingle();

    let customerId = existing?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        metadata: { user_id: user.id, channel_id: channelId },
      });
      customerId = customer.id;
    }

    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    // Set as default payment method
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    const priceId = plan === 'monthly' ? process.env.STRIPE_PRICE_MONTHLY : process.env.STRIPE_PRICE_YEARLY;
    if (!priceId) return NextResponse.json({ error: 'Missing Stripe price env' }, { status: 500 });

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: { user_id: user.id, channel_id: channelId, plan },
    });

    const invoice = subscription.latest_invoice as any;
    const paymentIntent = invoice?.payment_intent;

    // Confirm the payment intent if it requires confirmation
    if (paymentIntent?.status === 'requires_confirmation') {
      const confirmedIntent = await stripe.paymentIntents.confirm(paymentIntent.id);
      
      if (confirmedIntent.status === 'succeeded') {
        // Update database with successful subscription
        await admin.from('channel_subscriptions').upsert({
          user_id: user.id,
          channel_id: channelId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscription.id,
          plan,
          status: 'active',
          current_period_end: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
        }, { onConflict: 'user_id,channel_id' });

        return NextResponse.json({ success: true });
      } else if (confirmedIntent.status === 'requires_action') {
        return NextResponse.json({
          requiresAction: true,
          clientSecret: confirmedIntent.client_secret,
        });
      } else {
        console.error('Payment confirmation failed - status:', confirmedIntent.status);
        return NextResponse.json({ error: 'Payment confirmation failed', status: confirmedIntent.status }, { status: 400 });
      }
    }

    // Update database
    await admin.from('channel_subscriptions').upsert({
      user_id: user.id,
      channel_id: channelId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      plan,
      status: subscription.status as any,
      current_period_end: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
    }, { onConflict: 'user_id,channel_id' });

    if (paymentIntent?.status === 'requires_action') {
      return NextResponse.json({
        requiresAction: true,
        clientSecret: paymentIntent.client_secret,
      });
    } else if (paymentIntent?.status === 'succeeded') {
      return NextResponse.json({ success: true });
    } else {
      console.error('Payment failed - paymentIntent status:', paymentIntent?.status);
      return NextResponse.json({ error: 'Payment failed', status: paymentIntent?.status }, { status: 400 });
    }

  } catch (e: any) {
    console.error('Create subscription error:', e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}
