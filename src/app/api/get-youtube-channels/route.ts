import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";
import { getValidAccessToken } from "@/utils/googleAuth";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get a valid access token (refreshing if necessary)
    const tokenResult = await getValidAccessToken(user.id);

    if (!tokenResult.success) {
      return NextResponse.json({ error: tokenResult.error || "No Google access token found" }, { status: 400 });
    }

    // Get YouTube channels using the valid access token
    const channelsResponse = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
      { 
        headers: { 
          Authorization: `Bearer ${tokenResult.accessToken}`,
          'Content-Type': 'application/json'
        } 
      }
    );

    if (!channelsResponse.ok) {
      const error = await channelsResponse.text();
      console.error("YouTube API failed:", error);
      return NextResponse.json({ error: "Failed to fetch YouTube channels" }, { status: 400 });
    }

    const channelsData = await channelsResponse.json();
    const channels = channelsData.items ?? [];

    return NextResponse.json({ channels });
  } catch (error) {
    console.error("Get YouTube channels error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
