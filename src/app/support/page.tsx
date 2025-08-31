import DashboardLayout from "@/components/DashboardLayout";

export default function SupportPage() {
  return (
    <DashboardLayout showChannelSelector={false}>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Support</h1>
        <p className="text-gray-600">Get help and find answers to common questions.</p>
        
        <div className="bg-white rounded-lg p-8 shadow-sm">
          <p className="text-gray-500">Support resources and contact information will be displayed here.</p>
        </div>
      </div>
    </DashboardLayout>
  );
}
