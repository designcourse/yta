import YouTubeStats from "@/components/YouTubeStats";
import ExperimentsBacklog from "@/components/ExperimentsBacklog";

export default async function ChannelDashboardPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const resolvedParams = await params;
  const channelId = resolvedParams.channelId;

  const decoded = decodeURIComponent(channelId);
  return (
    <div className="space-y-6">
      <YouTubeStats channelId={decoded} />
      <ExperimentsBacklog channelId={decoded} />
    </div>
  );
}