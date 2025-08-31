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
    let accountName: string | undefined;
    let givenName: string | undefined;
    try {
      console.log("🔍 Attempting to get Google user info for channel association...");
      // Get user info from Google to identify the account
      const userInfoResponse = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      console.log("🔍 Google user info response status:", userInfoResponse.status);

      if (userInfoResponse.ok) {
        const userInfo = await userInfoResponse.json();
        googleSubId = userInfo.id;
        accountName = userInfo.name;
        givenName = userInfo.given_name;
        console.log("✅ Google account ID for channels:", googleSubId);
        console.log("✅ Google account name:", accountName);
        console.log("✅ Google given name:", givenName);
      } else {
        const errorText = await userInfoResponse.text();
        console.error("❌ Google user info API failed:", userInfoResponse.status, errorText);
      }
    } catch (error) {
      console.error("❌ Failed to get Google user info:", error);
      console.error("❌ Error details:", error instanceof Error ? error.message : 'Unknown error');
    }

    // Create or update a Google account record for this specific Google account
    if (googleSubId) {
      const payload: any = {
        user_id: originalUserId,
        google_sub: googleSubId,
        access_token: accessToken,
        refresh_token: refreshToken,
      };
      if (accountName) payload.account_name = accountName;
      if (givenName) payload.given_name = givenName;

      let { error: upsertError } = await admin
        .from("google_accounts")
        .upsert(payload, { onConflict: "user_id,google_sub" });

      if (upsertError && (upsertError.message?.includes("account_name") || upsertError.message?.includes("given_name"))) {
        delete payload.account_name;
        delete payload.given_name;
        const retry = await admin
          .from("google_accounts")
          .upsert(payload, { onConflict: "user_id,google_sub" });
        upsertError = retry.error;
      }
      console.log("Updated tokens for Google account:", googleSubId);
    } else {
      console.log("⚠️ No googleSubId available, attempting to find existing Google account...");

      // Try to find existing Google account for this user by matching access token or refresh token
      const { data: existingAccount } = await admin
        .from("google_accounts")
        .select("id, google_sub, given_name")
        .eq("user_id", originalUserId)
        .limit(1)
        .single();

      if (existingAccount) {
        googleSubId = existingAccount.google_sub;
        givenName = existingAccount.given_name;
        console.log("✅ Found existing Google account:", googleSubId, "with name:", givenName);

        // Update tokens for this existing account
        await admin.from("google_accounts").update({
          access_token: accessToken,
          refresh_token: refreshToken,
        }).eq("id", existingAccount.id);
        console.log("Updated tokens for existing Google account");
      } else {
        // Fallback: update the user's primary Google account
        await admin.from("google_accounts").update({
          access_token: accessToken,
          refresh_token: refreshToken,
        }).eq("user_id", originalUserId);
        console.log("Updated tokens for primary Google account (no google_sub)");
      }
    }

    // Add channels for ORIGINAL user, storing which Google account they belong to
    for (const channel of channels) {
      console.log(`🔍 Adding channel: ${channel.snippet?.title} (${channel.id}) with google_sub: ${googleSubId}`);

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
        console.log("⚠️ google_sub column doesn't exist, trying without it for channel:", channel.snippet?.title);
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

      if (result.error) {
        console.error(`❌ Failed to add channel ${channel.snippet?.title}:`, result.error.message);
      } else {
        console.log(`✅ Successfully added channel: ${channel.snippet?.title} with google_sub: ${googleSubId}`);
      }
    }

    // Return the channel IDs that were added
    const channelIds = channels.map(channel => channel.id);
    return NextResponse.json({
      success: true,
      channelsAdded: channels.length,
      channelIds: channelIds
    });
  } catch (error) {
    console.error("YouTube connect error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
