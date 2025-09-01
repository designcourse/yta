
export default async function MyGoalsPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const resolvedParams = await params;
  const channelId = resolvedParams.channelId;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">My Goals</h1>
      <p className="text-gray-600">Set and track your YouTube channel goals.</p>
      
      <div className="bg-white rounded-lg p-8 shadow-sm">
        <p className="text-gray-500">Goal setting and tracking features will be displayed here.</p>
      </div>
    </div>
  );
}
