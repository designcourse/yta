import LatestVideoClient from "@/components/LatestVideoClient";

export default async function LatestVideoPage({ params }: { params: Promise<{ channelId: string }> }) {
  const resolvedParams = await params;
  const channelId = resolvedParams.channelId;

  return (
    <LatestVideoClient channelId={channelId} />
  );
}
