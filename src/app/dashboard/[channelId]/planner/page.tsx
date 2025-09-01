import PlannerClient from "../../../../components/PlannerClient";

export default async function PlannerPage({ params }: { params: Promise<{ channelId: string }> }) {
  const resolvedParams = await params;
  const channelId = resolvedParams.channelId;

  return (
    <PlannerClient channelId={channelId} />
  );
}
