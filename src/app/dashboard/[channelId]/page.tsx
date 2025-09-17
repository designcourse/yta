import YouTubeStats from "@/components/YouTubeStats";
import ExperimentsBacklog from "@/components/ExperimentsBacklog";
import TrendsWidget from "@/components/TrendsWidget";
import WinRateSummary from "@/components/WinRateSummary";

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
      <TrendsWidget channelId={decoded} />
      <WinRateSummary channelId={decoded} />
      <ExperimentsBacklog channelId={decoded} />
    </div>
  );
}