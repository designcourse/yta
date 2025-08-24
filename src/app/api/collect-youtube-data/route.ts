import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { getValidAccessToken } from "@/utils/googleAuth";
import { interpretYouTubeData } from "@/utils/openai";

export async function POST(request: Request) {
  console.log("🎯 COLLECT YOUTUBE DATA API CALLED");
  try {
    const body = await request.json();
    const { channelId } = body;
    console.log("📺 Channel ID received:", channelId);

    if (!channelId) {
      return NextResponse.json({ error: "Channel ID required" }, { status: 400 });
    }

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

    // Get channel details from YouTube API with statistics
    const channelResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${channelId}`,
      {
        headers: {
          Authorization: `Bearer ${tokenResult.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!channelResponse.ok) {
      return NextResponse.json({ error: "Failed to fetch channel details" }, { status: 400 });
    }

    const channelData = await channelResponse.json();
    const channel = channelData.items?.[0];

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    // Calculate account age
    const publishedAt = new Date(channel.snippet.publishedAt);
    const now = new Date();
    const accountAgeInDays = Math.floor((now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60 * 24));
    const accountAge = `${Math.floor(accountAgeInDays / 365)} years, ${accountAgeInDays % 365} days`;

    // Extract the data we need
    const collectedData = {
      subscriberCount: parseInt(channel.statistics.subscriberCount),
      videoCount: parseInt(channel.statistics.videoCount),
      viewCount: parseInt(channel.statistics.viewCount),
      accountAge,
      publishedAt: channel.snippet.publishedAt,
      title: channel.snippet.title,
      description: channel.snippet.description,
      thumbnailUrl: channel.snippet.thumbnails?.default?.url,
    };

    // Update the channel record in the database with the collected data
    const { error: updateError } = await supabase
      .from("channels")
      .update({
        // Basic channel information
        title: collectedData.title,
        thumbnails: { default: { url: collectedData.thumbnailUrl } },
        // YouTube statistics
        subscriber_count: collectedData.subscriberCount,
        video_count: collectedData.videoCount,
        view_count: collectedData.viewCount,
        account_age: collectedData.accountAge,
        published_at: collectedData.publishedAt,
        updated_at: new Date().toISOString(),
      })
      .eq("channel_id", channelId)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Database update error:", updateError);
      return NextResponse.json({
        error: "Failed to update channel data",
        details: updateError.message
      }, { status: 500 });
    }

    // Get the updated channel data from database
    console.log("🔍 Looking for channel record in database...");
    const { data: channelRecord, error: channelError } = await supabase
      .from("channels")
      .select("id, google_account_id, google_sub, published_at")
      .eq("channel_id", channelId)
      .eq("user_id", user.id)
      .single();

    if (channelError) {
      console.error("❌ Error fetching channel record:", channelError);
      console.error("❌ Channel ID:", channelId);
      console.error("❌ User ID:", user.id);
    } else if (!channelRecord) {
      console.error("❌ No channel record found");
    } else {
      console.log("✅ Channel record found successfully");
    }

    let neriaResponse = null;

    if (channelRecord) {
      console.log("✅ Found channel record:", channelRecord.id);
      console.log("🔍 Channel google_account_id:", channelRecord.google_account_id);
      console.log("🔍 Channel google_sub:", channelRecord.google_sub);

      let googleAccount = null;

      // Try to get Google account by google_account_id first
      if (channelRecord.google_account_id) {
        const { data: account, error: accountError } = await supabase
          .from("google_accounts")
          .select("given_name, google_sub")
          .eq("id", channelRecord.google_account_id)
          .single();

        if (!accountError && account) {
          googleAccount = account;
          console.log("✅ Found Google account by ID:", googleAccount.given_name);
        }
      }

      // If no google_account_id or account not found, try by google_sub
      if (!googleAccount && channelRecord.google_sub) {
        console.log("🔄 Trying to find Google account by google_sub...");
        const { data: account, error: accountError } = await supabase
          .from("google_accounts")
          .select("given_name, google_sub")
          .eq("google_sub", channelRecord.google_sub)
          .single();

        if (!accountError && account) {
          googleAccount = account;
          console.log("✅ Found Google account by google_sub:", googleAccount.given_name);
        }
      }

      if (googleAccount) {
        // Calculate account age in a more readable format
        const publishedAt = new Date(channelRecord.published_at);
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - publishedAt.getTime());
        const diffYears = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 365));
        const diffMonths = Math.floor((diffTime % (1000 * 60 * 60 * 24 * 365)) / (1000 * 60 * 60 * 24 * 30));
        const diffDays = Math.floor((diffTime % (1000 * 60 * 60 * 24 * 30)) / (1000 * 60 * 60 * 24));

        let accountAgeText = '';
        if (diffYears > 0) {
          accountAgeText = `${diffYears} year${diffYears > 1 ? 's' : ''}`;
        } else if (diffMonths > 0) {
          accountAgeText = `${diffMonths} month${diffMonths > 1 ? 's' : ''}`;
        } else {
          accountAgeText = `${diffDays} day${diffDays > 1 ? 's' : ''}`;
        }

        // Create the Neria prompt
        const neriaPrompt = `You are now a YouTube coach. The channel name in question is ${collectedData.title}, they have a total of ${collectedData.subscriberCount.toLocaleString()} subscribers, ${collectedData.viewCount.toLocaleString()} views, ${collectedData.videoCount.toLocaleString()} videos, and the youtube account is ${accountAgeText} old. The channel's creator name is ${googleAccount.given_name}.

Your name is Neria. Neria is always very positive regardless of the status of their youtube account and future video analytics that you will have access to. The goal is to inspire confidence through positivity.

This will be the first time they hear from you. ${googleAccount.given_name} will be asking you for help regarding their YouTube channel.

While more information is being collected, provide a response to them in a friendly, affirming tone.

It can be something similar to, "Hi ${googleAccount.given_name}, I see you've ran ${collectedData.title} for ${accountAgeText}, and you've produced ${collectedData.videoCount.toLocaleString()} videos! Hang tight while I collect more data.."`;

        console.log("🔄 Starting Neria OpenAI call...");
        console.log("📝 Neria prompt:", neriaPrompt.substring(0, 100) + "...");
        console.log("🔑 OpenAI API Key present:", !!process.env.OPENAI_API_KEY);
        console.log("🔑 OpenAI API Key length:", process.env.OPENAI_API_KEY?.length || 0);

        try {
          // Call OpenAI with the Neria prompt
          console.log("🤖 Calling OpenAI API...");
          neriaResponse = await interpretYouTubeData({}, neriaPrompt);
          console.log("✅ OpenAI response received:", neriaResponse.substring(0, 100) + "...");

          // Store the context in neria_context table
          console.log("💾 Storing Neria context in database...");
          const { error: contextError } = await supabase
            .from("neria_context")
            .insert({
              channel_id: channelRecord.id,
              google_account: googleAccount.google_sub,
              published_at: channelRecord.published_at,
              prompt_text: neriaPrompt,
              prompt_type: "context"
            });

          if (contextError) {
            console.error("❌ Error storing Neria context:", contextError);
          } else {
            console.log("✅ Neria context stored successfully");
          }
        } catch (openaiError) {
          console.error("❌ OpenAI error:", openaiError);
          console.error("❌ Error details:", openaiError.message);
          // Continue without Neria response if OpenAI fails
        }
      }
    }

    return NextResponse.json({
      ...collectedData,
      neriaResponse
    });
  } catch (error) {
    console.error("Collect YouTube data error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
