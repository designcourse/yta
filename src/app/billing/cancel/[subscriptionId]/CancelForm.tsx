"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function CancelForm({ subscriptionId }: { subscriptionId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId, reason }),
      });
      const json = await res.json();
      if (json?.success) {
        router.push("/billing");
      } else {
        alert(json?.error || "Failed to cancel subscription");
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="bg-white rounded-lg p-8 shadow-sm space-y-4">
      <label className="block text-sm font-medium text-gray-700">Reason for cancellation</label>
      <textarea
        className="w-full min-h-[140px] rounded-md border border-gray-300 p-3 focus:outline-none focus:ring-2 focus:ring-black"
        placeholder="Please share your reason..."
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        required
      />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={isPending} className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
          {isPending ? "Cancelling..." : "Cancel Subscription"}
        </button>
        <button type="button" onClick={() => router.back()} className="px-4 py-2 rounded-md border border-gray-300 hover:bg-gray-50">
          Go back
        </button>
      </div>
    </form>
  );
}


