import CompetitorsManager from '@/components/CompetitorsManager';

export default async function CompetitorsPage({ params }: { params: Promise<{ channelId: string }> }) {
  const resolved = await params;
  const channelId = decodeURIComponent(resolved.channelId);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Competitors</h1>
      <p className="text-gray-600">Add up to 5 competitor channels. We compute topic hit rates and velocity for priors.</p>

      <div className="bg-white rounded-lg p-8 shadow-sm">
        <CompetitorsManager channelId={channelId} />
      </div>
    </div>
  );
}


