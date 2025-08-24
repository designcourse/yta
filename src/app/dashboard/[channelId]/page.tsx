import { createSupabaseServerClient } from "@/utils/supabase/server";
import Link from "next/link";
import YouTubeStats from "@/components/YouTubeStats";
import { redirect } from "next/navigation";

export default async function ChannelDashboardPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  
  const resolvedParams = await params;
  const selectedChannelId = decodeURIComponent(resolvedParams.channelId);

  if (!user) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="text-center">
          <p className="mb-4">Please sign in to access your dashboard</p>
          <Link className="text-sm px-3 py-1.5 border rounded" href="/">Go to home page</Link>
        </div>
      </div>
    );
  }

  const { data: channels } = await supabase
    .from("channels")
    .select("id, channel_id, title")
    .order("created_at", { ascending: true });

  // Redirect to onboard if user has no channels
  if (!channels || channels.length === 0) {
    redirect("/onboard");
  }

  return (
    <div className="min-h-screen grid grid-cols-[240px_1fr] pointer-events-none">
      <aside className="border-r border-black/10 p-4 space-y-2 bg-white/80 backdrop-blur-sm pointer-events-auto">
        <div className="text-sm font-semibold mb-2 text-black">Navigation</div>
        <nav className="flex flex-col gap-1">
          {(channels ?? []).map((c) => (
            <Link 
              key={c.id} 
              href={`/dashboard/${encodeURIComponent(c.channel_id)}`} 
              className={`px-2 py-1 rounded hover:bg-black/5 text-black ${
                selectedChannelId === c.channel_id ? 'bg-blue-100 text-blue-700' : ''
              }`}
            >
              {c.title || c.channel_id}
            </Link>
          ))}
          <button id="connect-youtube-btn" className="px-2 py-1 rounded hover:bg-black/5 text-left text-black">
            Connect YouTube channel
          </button>
        </nav>
      </aside>
      <main className="p-6 bg-white/80 backdrop-blur-sm pointer-events-auto">
        <YouTubeStats channelId={selectedChannelId} />
      </main>
      
      <script dangerouslySetInnerHTML={{
        __html: `
          document.getElementById('connect-youtube-btn').onclick = function() {
            const popup = window.open('/youtube-connect', 'youtube', 'width=500,height=600');
            window.addEventListener('message', function(event) {
              if (event.data && event.data.type === 'youtube-connected') {
                popup.close();
                const channelIds = event.data.channelIds;
                if (channelIds && channelIds.length > 0) {
                  // Redirect to collection page with the first channel
                  window.location.href = '/dashboard/collection?channelId=' + encodeURIComponent(channelIds[0]);
                } else {
                  // Fallback to reload if no channel IDs
                  window.location.reload();
                }
              }
            });
          };
        `
      }} />
    </div>
  );
}