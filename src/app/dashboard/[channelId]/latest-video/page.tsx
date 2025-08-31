import DashboardLayout from "@/components/DashboardLayout";

export default async function LatestVideoPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const resolvedParams = await params;
  const channelId = resolvedParams.channelId;

  return (
    <DashboardLayout 
      channelId={channelId}
      basePath="/dashboard/[channelId]/latest-video"
    >
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Latest Video</h1>
        <p className="text-gray-600">Analytics and insights for your most recent video.</p>
        
        <div className="bg-white rounded-lg p-8 shadow-sm">
          <p className="text-gray-500">Latest video analytics will be displayed here.</p>
        </div>
      </div>
    </DashboardLayout>
  );
}
