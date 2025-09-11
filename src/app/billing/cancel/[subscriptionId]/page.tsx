import DashboardLayout from "@/components/DashboardLayout";
import CancelForm from "./CancelForm";

export default async function CancelSubscriptionPage({ params }: { params: Promise<{ subscriptionId: string }> }) {
  const { subscriptionId } = await params;
  const decodedSubscriptionId = decodeURIComponent(subscriptionId);
  return (
    <DashboardLayout showChannelSelector={false} basePath="/billing">
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Cancel Subscription</h1>
        <p className="text-gray-600">We're sorry to see you go. Please let us know why you're cancelling.</p>
        <CancelForm subscriptionId={decodedSubscriptionId} />
      </div>
    </DashboardLayout>
  );
}


