import DashboardLayout from "@/components/DashboardLayout";

export default function AccountPage() {
  return (
    <DashboardLayout showChannelSelector={false}>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Account Settings</h1>
        <p className="text-gray-600">Manage your account preferences and settings.</p>
        
        <div className="bg-white rounded-lg p-8 shadow-sm">
          <p className="text-gray-500">Account settings will be displayed here.</p>
        </div>
      </div>
    </DashboardLayout>
  );
}
