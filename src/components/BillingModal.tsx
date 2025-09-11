"use client";

import { useEffect, useMemo, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardNumberElement, CardExpiryElement, CardCvcElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

type Props = {
  open: boolean;
  onClose: () => void;
  channelId: string;
};

function BillingForm({ channelId, isMonthly, onClose }: { channelId: string; isMonthly: boolean; onClose: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const go = async () => {
      if (!channelId) return;
      try {
        const res = await fetch(`/api/billing/status?channelId=${encodeURIComponent(channelId)}`);
        const json = await res.json();
        setIsAdmin(!!json?.isAdmin);
      } catch {}
    };
    go();
  }, [channelId]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!stripe || !elements || !agree) return;

    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const address = formData.get('address') as string;

    try {
      setSubmitting(true);

      // Create payment method
      const cardElement = elements.getElement(CardNumberElement);
      if (!cardElement) return;

      const { error, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
        billing_details: {
          name,
          address: { line1: address },
        },
      });

      if (error) {
        console.error('Payment method error:', error);
        return;
      }

      // Create subscription
      const res = await fetch('/api/billing/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId,
          plan: isMonthly ? 'monthly' : 'yearly',
          paymentMethodId: paymentMethod.id,
        }),
      });

      const json = await res.json();
      
      if (json.success) {
        window.location.href = `/dashboard?channelId=${encodeURIComponent(channelId)}`;
      } else if (json.requiresAction) {
        // Handle 3D Secure
        const { error: confirmError } = await stripe.confirmCardPayment(json.clientSecret);
        if (!confirmError) {
          window.location.href = `/dashboard?channelId=${encodeURIComponent(channelId)}`;
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const grantFree = async () => {
    try {
      setSubmitting(true);
      await fetch('/api/billing/grant-free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      });
      window.location.href = `/dashboard?channelId=${encodeURIComponent(channelId)}`;
    } finally {
      setSubmitting(false);
    }
  };

  const elementOptions = {
    style: {
      base: {
        fontSize: '16px',
        color: '#000',
        '::placeholder': { color: '#aab7c4' },
      },
    },
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <input type="text" name="name" placeholder="Full name" className="w-full border border-black rounded-md px-3 py-2" required />
      <input type="text" name="address" placeholder="Billing address" className="w-full border border-black rounded-md px-3 py-2" required />
      
      <div className="border-t border-black/20 pt-4 mt-2">
        <div className="text-sm font-semibold mb-3">Payment Information</div>
        <div className="space-y-3">
          <div className="border border-black rounded-md px-3 py-2">
            <CardNumberElement options={elementOptions} />
          </div>
          <div className="flex gap-3">
            <div className="flex-1 border border-black rounded-md px-3 py-2">
              <CardExpiryElement options={elementOptions} />
            </div>
            <div className="flex-1 border border-black rounded-md px-3 py-2">
              <CardCvcElement options={elementOptions} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 mt-2">
        <input id="agree" type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <label htmlFor="agree" className="text-sm">
          I agree to the <a className="underline" href="/terms" target="_blank" rel="noreferrer">terms</a> and <a className="underline" href="/privacy" target="_blank" rel="noreferrer">privacy policy</a>
        </label>
      </div>
      
      <button
        type="submit"
        disabled={!agree || submitting || !stripe}
        className={`mt-2 px-4 py-3 border-2 border-black rounded-lg font-semibold ${!agree || submitting || !stripe ? 'bg-gray-200 text-black' : 'bg-black text-white'}`}
      >
        {submitting ? 'Processing…' : 'Complete Payment'}
      </button>

      {isAdmin && (
        <button type="button" onClick={grantFree} className="mt-2 text-xs underline text-black/70" disabled={submitting}>Grant free</button>
      )}
    </form>
  );
}

export default function BillingModal({ open, onClose, channelId }: Props) {
  const [isMonthly, setIsMonthly] = useState(true);

  const price = useMemo(() => (
    isMonthly ? { label: 'Monthly', amount: '$29/mo' } : { label: 'Yearly', amount: '$240/yr ($20/mo)' }
  ), [isMonthly]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white border border-black shadow-[8px_8px_0_0_#000] rounded-[16px] w-full max-w-[900px] p-0 overflow-hidden">
        <div className="w-full flex">
          <div className="flex-1 p-6">
            <div className="flex items-center gap-4 mb-6">
              <button
                className={`px-4 py-2 border-2 border-black rounded-full ${isMonthly ? 'bg-black text-white' : 'bg-white text-black'}`}
                onClick={() => setIsMonthly(true)}
              >Monthly</button>
              <button
                className={`px-4 py-2 border-2 border-black rounded-full ${!isMonthly ? 'bg-black text-white' : 'bg-white text-black'}`}
                onClick={() => setIsMonthly(false)}
              >Yearly</button>
            </div>

            <div className="mb-4">
              <div className="text-[28px] font-bold">{price.amount}</div>
              <div className="text-black/70">Recurring subscription for this YouTube channel</div>
            </div>

            <Elements stripe={stripePromise}>
              <BillingForm channelId={channelId} isMonthly={isMonthly} onClose={onClose} />
            </Elements>
          </div>
          <div className="w-[30%] min-w-[240px] border-l border-black p-6 bg-[#fafafa]">
            <div className="font-bold text-[18px] mb-3">What you get</div>
            <ul className="list-disc pl-5 text-sm leading-6">
              <li>AI-driven channel insights</li>
              <li>Winners/losers analysis (90 days)</li>
              <li>Video planning tools</li>
              <li>Priority support</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}


