import { NextResponse } from 'next/server';
import { getStripeClient } from '@/utils/stripe';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const stripe = getStripeClient();
    const payload = await request.text();
    const sig = request.headers.get('stripe-signature') || '';
    const whSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
    let event: any;
    try {
      event = stripe.webhooks.constructEvent(payload, sig, whSecret);
    } catch (err: any) {
      return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
    }

    const admin = createSupabaseAdminClient();

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any;
        const subscriptionId = session.subscription as string | undefined;
        const customerId = session.customer as string | undefined;
        const meta = session.metadata || {};
        const userId = meta.user_id;
        const channelId = meta.channel_id;
        const plan = meta.plan || 'monthly';
        if (userId && channelId) {
          await admin.from('channel_subscriptions').upsert({
            user_id: userId,
            channel_id: channelId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            status: 'active',
            plan,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,channel_id' });
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as any;
        const customerId = sub.customer as string | undefined;
        const status = sub.status as string;
        const currentPeriodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
        if (customerId) {
          await admin.from('channel_subscriptions').update({
            status,
            current_period_end: currentPeriodEnd,
            updated_at: new Date().toISOString(),
          }).eq('stripe_subscription_id', sub.id);
        }
        break;
      }
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true });
}


