import DashboardLayout from "@/components/DashboardLayout";

export default async function PlannerPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const resolvedParams = await params;
  const channelId = resolvedParams.channelId;

  return (
    <DashboardLayout 
      channelId={channelId}
      basePath="/dashboard/[channelId]/planner"
    >
      <div className="space-y-15">
        {/* Generate More CTA */}
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
            <path 
              d="M12 2V6M12 18V22M4.93 4.93L7.76 7.76M16.24 16.24L19.07 19.07M2 12H6M18 12H22M4.93 19.07L7.76 16.24M16.24 7.76L19.07 4.93" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round"
            />
          </svg>
          <span className="text-[22px] text-gray-900">Generate more</span>
        </div>

        {/* Card Container */}
        <div className="space-y-15">
          {/* Thumbnail Card */}
          <div className="bg-white rounded-lg overflow-hidden shadow-sm">
            {/* Thumbnail Image */}
            <div className="w-full h-[221px] bg-gray-200 flex items-center justify-center">
              <span className="text-gray-500">Thumbnail Preview</span>
            </div>

            {/* Card Content */}
            <div className="p-4 flex items-center gap-4">
              {/* Avatar */}
              <div className="w-11 h-11 rounded-full bg-gray-300 flex-shrink-0"></div>
              
              {/* Info Container */}
              <div className="flex-1">
                <h3 className="text-2xl font-medium text-gray-900 mb-1">Card Title</h3>
                <p className="text-2xl text-gray-600">Channel</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
