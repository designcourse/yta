
import GoalsForm from '@/components/GoalsForm';

export default async function MyGoalsPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const resolvedParams = await params;
  const channelId = decodeURIComponent(resolvedParams.channelId);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">My Goals</h1>
      <p className="text-gray-600">Adjust weights to emphasize growth, monetization, community, and shorts.</p>

      <div className="bg-white rounded-lg p-8 shadow-sm">
        <GoalsForm channelId={channelId} />
      </div>
    </div>
  );
}
