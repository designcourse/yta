"use client";

import { useEffect, useState } from "react";

interface CancellationNoticeProps {
  subscriptionId: string;
  onCancellationStatus?: (isCancelled: boolean) => void;
}

export default function CancellationNotice({ subscriptionId, onCancellationStatus }: CancellationNoticeProps) {
  const [cancelInfo, setCancelInfo] = useState<{ cancelAtPeriodEnd: boolean; currentPeriodEnd: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkCancellationStatus = async () => {
      try {
        const res = await fetch(`/api/billing/subscription-status?subscriptionId=${encodeURIComponent(subscriptionId)}`);
        const data = await res.json();
        setCancelInfo(data);
        if (onCancellationStatus) {
          onCancellationStatus(data.cancelAtPeriodEnd || false);
        }
      } catch (error) {
        console.error('Error checking cancellation status:', error);
      } finally {
        setLoading(false);
      }
    };

    checkCancellationStatus();
  }, [subscriptionId]);

  if (loading || !cancelInfo?.cancelAtPeriodEnd) {
    return null;
  }

  const endDate = cancelInfo.currentPeriodEnd ? new Date(cancelInfo.currentPeriodEnd).toLocaleDateString() : null;

  return (
    <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
      <div className="flex">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-yellow-800">
            Subscription Cancelled
          </h3>
          <div className="mt-1 text-sm text-yellow-700">
            Your subscription is cancelled and will end on {endDate || 'the end of your current billing period'}. You'll continue to have access until then.
          </div>
        </div>
      </div>
    </div>
  );
}
