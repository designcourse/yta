"use client";

import { useState } from "react";
import Link from "next/link";
import BillingPortalButton from "./BillingPortalButton";
import CancellationNotice from "./CancellationNotice";

interface SubscriptionRowProps {
  subscription: {
    stripe_subscription_id: string;
    plan: string;
    status: string;
    current_period_end: string | null;
  };
  channel: {
    title: string;
  } | undefined;
}

export default function SubscriptionRow({ subscription, channel }: SubscriptionRowProps) {
  const [isCancelled, setIsCancelled] = useState(false);
  
  const nextRenewal = subscription.current_period_end 
    ? new Date(subscription.current_period_end).toLocaleDateString() 
    : "—";

  return (
    <li className="py-4 flex items-center justify-between">
      <div className="flex-1">
        <div className="text-gray-900 font-medium">{channel?.title || "Channel"}</div>
        <div className="text-sm text-gray-600">
          Plan: {subscription.plan} • Status: {subscription.status}
          {nextRenewal !== '—' ? ` • Next renewal: ${nextRenewal}` : ''}
        </div>
        <CancellationNotice 
          subscriptionId={subscription.stripe_subscription_id} 
          onCancellationStatus={setIsCancelled}
        />
      </div>
      <div className="flex items-center gap-3">
        <BillingPortalButton subscriptionId={subscription.stripe_subscription_id} />
        {!isCancelled && (
          <Link 
            href={`/billing/cancel/${encodeURIComponent(subscription.stripe_subscription_id)}`} 
            className="px-3 py-2 rounded-md border border-red-300 text-red-600 hover:bg-red-50 text-sm"
          >
            Cancel
          </Link>
        )}
      </div>
    </li>
  );
}
