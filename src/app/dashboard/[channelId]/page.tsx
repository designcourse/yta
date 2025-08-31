import DashboardLayout from "@/components/DashboardLayout";
import YouTubeStats from "@/components/YouTubeStats";

export default async function ChannelDashboardPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const resolvedParams = await params;
  const channelId = resolvedParams.channelId;

  return (
    <DashboardLayout channelId={channelId}>
      <YouTubeStats channelId={decodeURIComponent(channelId)} />
    </DashboardLayout>
  );
}