import DashboardLayout from "@/components/DashboardLayout";
import PlannerClient from "../../../../components/PlannerClient";

export default async function PlannerPage({ params }: { params: Promise<{ channelId: string }> }) {
  const resolvedParams = await params;
  const channelId = resolvedParams.channelId;

  return (
    <DashboardLayout channelId={channelId} basePath="/dashboard/[channelId]/planner">
      <PlannerClient channelId={channelId} />
    </DashboardLayout>
  );
}
