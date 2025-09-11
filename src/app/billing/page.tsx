import DashboardLayout from "@/components/DashboardLayout";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import SubscriptionRow from "@/components/SubscriptionRow";

export default async function BillingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: subs } = await supabase
    .from("channel_subscriptions")
    .select("user_id, channel_id, stripe_subscription_id, stripe_customer_id, plan, status, current_period_end, created_at")
    .eq("user_id", user?.id || "")
    .in("status", ["active", "canceled"]);

  const channelIds = (subs || []).map((s: any) => s.channel_id);
  const { data: channels } = channelIds.length
    ? await supabase.from("channels").select("id, title, channel_id").in("id", channelIds)
    : { data: [] as any[] };

  const channelMap = new Map<string, { id: string; title: string; channel_id: string }>();
  (channels || []).forEach((c: any) => channelMap.set(c.id, c));

  return (
    <DashboardLayout showChannelSelector={false} basePath="/billing">
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Billing</h1>
        <p className="text-gray-600">Manage your active subscriptions and billing information.</p>

        <div className="bg-white rounded-lg p-8 shadow-sm">
          {(!subs || subs.length === 0) ? (
            <p className="text-gray-500">No active subscriptions found.</p>
          ) : (
            <ul className="divide-y divide-gray-200">
              {subs!.map((s: any) => {
                const c = channelMap.get(s.channel_id);
                return (
                  <SubscriptionRow
                    key={s.stripe_subscription_id}
                    subscription={s}
                    channel={c}
                  />
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}


