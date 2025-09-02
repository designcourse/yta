import { createSupabaseServerClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export default async function VideoPlanPage({ params }: { params: Promise<{ channelId: string; planId: string }> }) {
  const { channelId, planId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const { data: plan } = await supabase
    .from("video_plans")
    .select("id, title, summary, created_at, updated_at")
    .eq("id", planId)
    .eq("user_id", user!.id)
    .maybeSingle();

  // Load channel info for avatar and name
  const { data: channel } = await supabase
    .from("channels")
    .select("title, thumbnails")
    .eq("channel_id", channelId)
    .eq("user_id", user!.id)
    .maybeSingle();

  const thumbnails = (channel as any)?.thumbnails || {};
  const avatarUrl = thumbnails?.high?.url || thumbnails?.medium?.url || thumbnails?.default?.url || thumbnails?.maxres?.url || thumbnails?.standard?.url || null;

  return (
    <div className="space-y-15">
      <div className="relative">
        <div className="grid grid-cols-[380px_1fr] gap-[50px]">
          <div className="bg-white rounded-lg overflow-hidden max-w-[380px]">
            <div className="w-full h-[221px] flex items-center justify-center" style={{ backgroundColor: '#D7D9F2' }}>
              <span className="text-gray-500">Thumbnail Preview</span>
            </div>
            <div className="p-4 flex items gap-4">
              <div className="w-8 h-8 rounded-full bg-gray-300 flex-shrink-0 overflow-hidden">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img 
                    src={avatarUrl}
                    alt={`${channel?.title || 'Channel'} avatar`}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-300 flex items-center justify-center">
                    <span className="text-white font-medium text-sm">{(channel?.title as string | undefined)?.charAt(0) || '?'}</span>
                  </div>
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-gray-900 mb-1 leading-tight min-h-[2.5rem]">
                  <span className="line-clamp-2">{plan?.title || 'Selected Video'}</span>
                </h3>
                <p className="text-base text-gray-600">{channel?.title || 'DesignCourse'}</p>
              </div>
            </div>
          </div>

          <div>
            <p className="text-gray-800 whitespace-pre-line">{plan?.summary || 'Generating...'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}


