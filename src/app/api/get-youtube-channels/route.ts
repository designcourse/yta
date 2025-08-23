import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get the user's Google access token from our database
    const admin = createSupabaseAdminClient();
    const { data: googleAccount } = await admin
      .from("google_accounts")
      .select("access_token, refresh_token")
      .eq("user_id", user.id)
      .single();

    if (!googleAccount?.access_token) {
      return NextResponse.json({ error: "No Google access token found" }, { status: 400 });
    }

    // Get YouTube channels using the existing access token
    const channelsResponse = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
      { 
        headers: { 
          Authorization: `Bearer ${googleAccount.access_token}`,
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
