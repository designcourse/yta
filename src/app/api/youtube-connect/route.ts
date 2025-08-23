import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { code, originalUserId, redirectUri } = body;

    if (!code || !originalUserId) {
      return NextResponse.json({ error: "Code and originalUserId required" }, { status: 400 });
    }

    console.log("YouTube connect - For original user:", originalUserId);

    // Exchange code for tokens directly with Google
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || "5489903736-euc1v8ficip96b4d7jbc07ib34h7hl9e.apps.googleusercontent.com",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        redirect_uri: redirectUri || "http://localhost:3000/youtube-callback",
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error("Token exchange failed:", error);
      return NextResponse.json({ error: "Token exchange failed" }, { status: 400 });
    }

    const tokens = await tokenResponse.json();
    const accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token;

    console.log("Got access token:", accessToken ? "yes" : "no");

    // Get YouTube channels
    const channelsResponse = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!channelsResponse.ok) {
      const error = await channelsResponse.text();
      console.error("YouTube API failed:", error);
      return NextResponse.json({ error: "YouTube API failed" }, { status: 400 });
    }

    const channelsData = await channelsResponse.json();
    const channels = channelsData.items ?? [];

    console.log("Found channels:", channels.length);

    const admin = createSupabaseAdminClient();

    // Update google_accounts with YouTube tokens for ORIGINAL user
    await admin.from("google_accounts").update({
      access_token: accessToken,
      refresh_token: refreshToken,
    }).eq("user_id", originalUserId);

    console.log("Updated tokens for ORIGINAL user:", originalUserId);

    // Add channels for ORIGINAL user
    for (const channel of channels) {
      const result = await admin.from("channels").upsert(
        {
          user_id: originalUserId,
          channel_id: channel.id,
          title: channel.snippet?.title ?? null,
          thumbnails: channel.snippet?.thumbnails ?? null,
        },
        { onConflict: "user_id,channel_id" }
      );
      console.log("Added channel for ORIGINAL user:", channel.snippet?.title, result.error ? result.error : "success");
    }

    return NextResponse.json({ success: true, channelsAdded: channels.length });
  } catch (error) {
    console.error("YouTube connect error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
