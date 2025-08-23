import { createSupabaseServerClient } from "@/utils/supabase/server";
import Link from "next/link";
import YouTubeStats from "@/components/YouTubeStats";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  
  const resolvedSearchParams = await searchParams;
  const selectedChannelId = resolvedSearchParams.channel as string;

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

  return (
    <div className="min-h-screen grid grid-cols-[240px_1fr]">
      <aside className="border-r border-black/10 dark:border-white/10 p-4 space-y-2">
        <div className="text-sm font-semibold mb-2">Navigation</div>
        <nav className="flex flex-col gap-1">
          {(channels ?? []).map((c) => (
            <Link 
              key={c.id} 
              href={`/dashboard?channel=${encodeURIComponent(c.channel_id)}`} 
              className={`px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/10 ${
                selectedChannelId === c.channel_id ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300' : ''
              }`}
            >
              {c.title || c.channel_id}
            </Link>
          ))}
          <button id="connect-youtube-btn" className="px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-left">
            Connect YouTube channel
          </button>
        </nav>
      </aside>
      <main className="p-6">
        {selectedChannelId ? (
          <YouTubeStats channelId={selectedChannelId} />
        ) : (
          <div>
            <h1 className="text-2xl font-semibold">Your Dashboard</h1>
            <p className="mt-2 text-sm opacity-80">Select a channel from the left to view detailed analytics for the last 90 days.</p>
          </div>
        )}
      </main>
      
      <script dangerouslySetInnerHTML={{
        __html: `
          document.getElementById('connect-youtube-btn').onclick = function() {
            const popup = window.open('/youtube-connect', 'youtube', 'width=500,height=600');
            window.addEventListener('message', function(event) {
              if (event.data === 'youtube-connected') {
                popup.close();
                window.location.reload();
              }
            });
          };
        `
      }} />
    </div>
  );
}
