import DashboardLayout from "@/components/DashboardLayout";
import LatestVideoClient from "@/components/LatestVideoClient";

export default async function LatestVideoPage({ params }: { params: Promise<{ channelId: string }> }) {
  const resolvedParams = await params;
  const channelId = resolvedParams.channelId;

  return (
    <DashboardLayout channelId={channelId} basePath="/dashboard/[channelId]/latest-video">
      <LatestVideoClient channelId={channelId} />
    </DashboardLayout>
  );
}
