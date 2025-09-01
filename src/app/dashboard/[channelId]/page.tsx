import YouTubeStats from "@/components/YouTubeStats";

export default async function ChannelDashboardPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const resolvedParams = await params;
  const channelId = resolvedParams.channelId;

  return (
    <YouTubeStats channelId={decodeURIComponent(channelId)} />
  );
}