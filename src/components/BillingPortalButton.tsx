"use client";

import { useState } from "react";

export default function BillingPortalButton({ subscriptionId }: { subscriptionId: string }) {
  const [loading, setLoading] = useState(false);

  const openPortal = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId }),
      });
      const json = await res.json();
      if (json?.url) {
        window.location.href = json.url as string;
      } else {
        console.error("Portal API error:", json);
        if (json?.error?.includes('Not a valid URL')) {
          alert("Billing portal not configured yet. Please contact support to update your billing information.");
        } else {
          alert(json?.error || "Unable to open billing portal");
        }
      }
    } catch (e: any) {
      alert(e?.message || "Unable to open billing portal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button onClick={openPortal} disabled={loading} className="px-3 py-2 rounded-md border border-gray-300 hover:bg-gray-50 text-sm">
      {loading ? "Opening..." : "Update billing info"}
    </button>
  );
}


