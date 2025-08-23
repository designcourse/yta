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

    // Get the Google account info for this specific set of channels
    // We need to identify which Google account these channels belong to
    let googleSubId = null;
    try {
      // Get user info from Google to identify the account
      const userInfoResponse = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      
      if (userInfoResponse.ok) {
        const userInfo = await userInfoResponse.json();
        googleSubId = userInfo.id;
        console.log("Google account ID for channels:", googleSubId);
      }
    } catch (error) {
      console.error("Failed to get Google user info:", error);
    }

    // Create or update a Google account record for this specific Google account
    if (googleSubId) {
      await admin.from("google_accounts").upsert(
        {
          user_id: originalUserId,
          google_sub: googleSubId,
          access_token: accessToken,
          refresh_token: refreshToken,
        },
        { onConflict: "user_id,google_sub" }
      );
      console.log("Updated tokens for Google account:", googleSubId);
    } else {
      // Fallback: update the user's primary Google account
      await admin.from("google_accounts").update({
        access_token: accessToken,
        refresh_token: refreshToken,
      }).eq("user_id", originalUserId);
      console.log("Updated tokens for primary Google account");
    }

    // Add channels for ORIGINAL user, storing which Google account they belong to
    for (const channel of channels) {
      // First try with google_sub field
      let result = await admin.from("channels").upsert(
        {
          user_id: originalUserId,
          channel_id: channel.id,
          title: channel.snippet?.title ?? null,
          thumbnails: channel.snippet?.thumbnails ?? null,
          google_sub: googleSubId, // Store which Google account this channel belongs to
        },
        { onConflict: "user_id,channel_id" }
      );

      // If that fails (maybe google_sub column doesn't exist), try without it
      if (result.error && result.error.message?.includes('google_sub')) {
        console.log("google_sub column doesn't exist, trying without it for channel:", channel.snippet?.title);
        result = await admin.from("channels").upsert(
          {
            user_id: originalUserId,
            channel_id: channel.id,
            title: channel.snippet?.title ?? null,
            thumbnails: channel.snippet?.thumbnails ?? null,
          },
          { onConflict: "user_id,channel_id" }
        );
      }

      console.log("Added channel for ORIGINAL user:", channel.snippet?.title, result.error ? result.error.message : "success");
    }

    return NextResponse.json({ success: true, channelsAdded: channels.length });
  } catch (error) {
    console.error("YouTube connect error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
