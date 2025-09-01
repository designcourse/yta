
export default async function BestPerformingPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const resolvedParams = await params;
  const channelId = resolvedParams.channelId;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Best Performing</h1>
      <p className="text-gray-600">Your top performing videos and insights.</p>
      
      <div className="bg-white rounded-lg p-8 shadow-sm">
        <p className="text-gray-500">Best performing video analytics will be displayed here.</p>
      </div>
    </div>
  );
}
