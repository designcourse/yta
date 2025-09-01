import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { getValidAccessToken } from "@/utils/googleAuth";
import { interpretYouTubeData } from "@/utils/openai";
import { getPrompt, renderTemplate } from "@/utils/prompts";

// Debug endpoint to test specific channels
// Usage: GET /api/collect-youtube-data?channelId=UCXXX
// Usage: PATCH /api/collect-youtube-data?channelId=UCXXX (to fix broken associations)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const channelId = url.searchParams.get('channelId');

  console.log("🔍 DEBUG: Testing channel:", channelId);

  if (!channelId) {
    return NextResponse.json({ error: "Channel ID required" }, { status: 400 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    console.log("🔍 DEBUG: User authenticated:", user.id);

    // Get channel record
    const { data: channelRecord, error: channelError } = await supabase
      .from("channels")
      .select("id, google_account_id, google_sub, published_at")
      .eq("channel_id", channelId)
      .eq("user_id", user.id)
      .single();

    console.log("🔍 DEBUG: Channel record lookup result:", {
      found: !!channelRecord,
      error: channelError,
      channelRecordId: channelRecord?.id
    });

    if (channelError || !channelRecord) {
      return NextResponse.json({
        debug: {
          channelId,
          userId: user.id,
          channelRecordFound: !!channelRecord,
          error: channelError
        },
        message: "Channel record not found"
      });
    }

    // Check Google account
    let googleAccount = null;
    if (channelRecord.google_account_id) {
      const { data: account, error: accountError } = await supabase
        .from("google_accounts")
        .select("given_name, google_sub")
        .eq("id", channelRecord.google_account_id)
        .single();

      if (!accountError && account) {
        googleAccount = account;
      }
    }

    if (!googleAccount && channelRecord.google_sub) {
      const { data: account, error: accountError } = await supabase
        .from("google_accounts")
        .select("given_name, google_sub")
        .eq("google_sub", channelRecord.google_sub)
        .single();

      if (!accountError && account) {
        googleAccount = account;
      }
    }

    console.log("🔍 DEBUG: Google account lookup result:", {
      googleAccountFound: !!googleAccount,
      givenName: googleAccount?.given_name,
      googleSub: googleAccount?.google_sub
    });

    // Additional debug: Check all google accounts for this user
    const { data: allGoogleAccounts } = await supabase
      .from("google_accounts")
      .select("id, google_sub, given_name, account_name")
      .eq("user_id", user.id);

    console.log("🔍 DEBUG: All Google accounts for user:", allGoogleAccounts);

    return NextResponse.json({
      debug: {
        channelId,
        userId: user.id,
        channelRecordId: channelRecord.id,
        googleAccountFound: !!googleAccount,
        givenName: googleAccount?.given_name,
        publishedAt: channelRecord.published_at,
        allGoogleAccounts: allGoogleAccounts
      },
      message: googleAccount ? "Ready for Neria response" : "Missing Google account data"
    });

  } catch (error) {
    console.error("🔍 DEBUG: Error:", error);
    return NextResponse.json({ error: "Debug endpoint failed", details: error }, { status: 500 });
  }
}

// Fix endpoint for broken channel associations
export async function PATCH(request: Request) {
  const url = new URL(request.url);
  const channelId = url.searchParams.get('channelId');

  console.log("🔧 FIX: Attempting to fix channel:", channelId);

  if (!channelId) {
    return NextResponse.json({ error: "Channel ID required" }, { status: 400 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get the broken channel record
    const { data: channelRecord, error: channelError } = await supabase
      .from("channels")
      .select("id, google_account_id, google_sub")
      .eq("channel_id", channelId)
      .eq("user_id", user.id)
      .single();

    if (channelError || !channelRecord) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    console.log("🔧 FIX: Current channel record:", channelRecord);

    // Get all Google accounts for this user
    const { data: googleAccounts } = await supabase
      .from("google_accounts")
      .select("id, google_sub, given_name, account_name")
      .eq("user_id", user.id);

    console.log("🔧 FIX: Available Google accounts:", googleAccounts);

    if (!googleAccounts || googleAccounts.length === 0) {
      return NextResponse.json({ error: "No Google accounts found for user" }, { status: 404 });
    }

    // If channel has google_sub but no google_account_id, try to find and fix it
    if (channelRecord.google_sub && !channelRecord.google_account_id) {
      const matchingAccount = googleAccounts.find(acc => acc.google_sub === channelRecord.google_sub);

      if (matchingAccount) {
        console.log("🔧 FIX: Found matching Google account:", matchingAccount);

        // Update the channel record with the correct google_account_id
        const { error: updateError } = await supabase
          .from("channels")
          .update({
            google_account_id: matchingAccount.id
          })
          .eq("id", channelRecord.id);

        if (updateError) {
          console.error("🔧 FIX: Failed to update channel:", updateError);
          return NextResponse.json({ error: "Failed to fix channel association" }, { status: 500 });
        }

        console.log("🔧 FIX: Successfully fixed channel association");
        return NextResponse.json({
          success: true,
          message: "Channel association fixed",
          fixed: {
            channelId,
            googleAccountId: matchingAccount.id,
            givenName: matchingAccount.given_name
          }
        });
      }
    }

    // If channel has no google_sub, try to assign it to the first available account
    if (!channelRecord.google_sub && googleAccounts.length > 0) {
      const firstAccount = googleAccounts[0];
      console.log("🔧 FIX: Assigning channel to first available account:", firstAccount);

      const { error: updateError } = await supabase
        .from("channels")
        .update({
          google_sub: firstAccount.google_sub,
          google_account_id: firstAccount.id
        })
        .eq("id", channelRecord.id);

      if (updateError) {
        console.error("🔧 FIX: Failed to assign channel to account:", updateError);
        return NextResponse.json({ error: "Failed to assign channel to account" }, { status: 500 });
      }

      console.log("🔧 FIX: Successfully assigned channel to account");
      return NextResponse.json({
        success: true,
        message: "Channel assigned to Google account",
        fixed: {
          channelId,
          googleAccountId: firstAccount.id,
          givenName: firstAccount.given_name
        }
      });
    }

    return NextResponse.json({
      success: false,
      message: "No fixes available for this channel",
      currentState: channelRecord
    });

  } catch (error) {
    console.error("🔧 FIX: Error:", error);
    return NextResponse.json({ error: "Fix endpoint failed", details: error }, { status: 500 });
  }
}

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
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails,brandingSettings&id=${channelId}`,
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
    const collectedData: any = {
      subscriberCount: parseInt(channel.statistics.subscriberCount),
      videoCount: parseInt(channel.statistics.videoCount),
      viewCount: parseInt(channel.statistics.viewCount),
      accountAge,
      publishedAt: channel.snippet.publishedAt,
      title: channel.snippet.title,
      description: channel.snippet.description,
      thumbnailUrl: channel.snippet.thumbnails?.default?.url,
    };

    // Try to fetch recent video titles (up to 10)
    let recentTitles: string[] = [];
    try {
      const uploadsPlaylistId = channel?.contentDetails?.relatedPlaylists?.uploads;
      if (uploadsPlaylistId) {
        const playlistItemsRes = await fetch(
          `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=10`,
          {
            headers: {
              Authorization: `Bearer ${tokenResult.accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        if (playlistItemsRes.ok) {
          const playlistItems = await playlistItemsRes.json();
          recentTitles = (playlistItems.items || [])
            .map((it: any) => it?.snippet?.title)
            .filter((t: any) => typeof t === 'string' && t.trim().length > 0);
        }
      }
    } catch (e) {
      console.warn('⚠️ Failed to fetch recent video titles', e);
    }
    collectedData.recentVideoTitles = recentTitles;

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

      // If no google_account found but channel has google_sub, try to create/fix the association
      if (!googleAccount && channelRecord.google_sub) {
        console.log("🔄 Attempting to create missing Google account record for google_sub:", channelRecord.google_sub);

        // Try to find if there's an existing google account with this google_sub for this user
        const { data: existingGoogleAccount } = await supabase
          .from("google_accounts")
          .select("given_name, google_sub")
          .eq("google_sub", channelRecord.google_sub)
          .eq("user_id", user.id)
          .single();

        if (existingGoogleAccount) {
          googleAccount = existingGoogleAccount;
          console.log("✅ Found existing Google account by google_sub:", googleAccount.given_name);
        } else {
          console.log("⚠️ No Google account record found for google_sub:", channelRecord.google_sub);
          console.log("⚠️ This might indicate a data integrity issue");
        }
      }

      if (googleAccount) {
        console.log("✅ Google account found for Neria response:", googleAccount.given_name);

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

        // Validate all required data is present before creating prompt
        if (!collectedData.title || typeof collectedData.subscriberCount !== 'number' || typeof collectedData.videoCount !== 'number' || typeof collectedData.viewCount !== 'number') {
          console.error("❌ Missing required channel data for OpenAI prompt:", {
            title: collectedData.title,
            subscriberCount: collectedData.subscriberCount,
            videoCount: collectedData.videoCount,
            viewCount: collectedData.viewCount
          });
          throw new Error('Missing required channel data for OpenAI prompt');
        }

        if (!googleAccount.given_name || !accountAgeText) {
          console.error("❌ Missing required Google account data for OpenAI prompt:", {
            givenName: googleAccount.given_name,
            accountAgeText
          });
          throw new Error('Missing required Google account data for OpenAI prompt');
        }

        // Store channel context for later question inference
        try {
          const { error: ctxAboutErr } = await supabase
            .from("neria_context")
            .insert({
              channel_id: channelRecord.id,
              google_account: googleAccount.google_sub,
              published_at: channelRecord.published_at,
              prompt_text: collectedData.description || '',
              prompt_type: "channel_about"
            });
          if (ctxAboutErr) console.warn('⚠️ Failed to store channel_about context', ctxAboutErr);

          if (recentTitles.length > 0) {
            const { error: ctxTitlesErr } = await supabase
              .from("neria_context")
              .insert({
                channel_id: channelRecord.id,
                google_account: googleAccount.google_sub,
                published_at: channelRecord.published_at,
                prompt_text: JSON.stringify(recentTitles),
                prompt_type: "recent_video_titles"
              });
            if (ctxTitlesErr) console.warn('⚠️ Failed to store recent_video_titles context', ctxTitlesErr);
          }
        } catch {}

        // Create the concise Neria prompt from DB template
        const collectionTpl = await getPrompt('collection_greeting');
        const neriaPrompt = renderTemplate(collectionTpl, {
          given_name: googleAccount.given_name,
          channel_title: collectedData.title,
          subscriber_count: collectedData.subscriberCount.toLocaleString(),
          video_count: collectedData.videoCount.toLocaleString(),
        });

        console.log("🔄 Starting Neria OpenAI call...");
        console.log("📝 Neria prompt:", neriaPrompt.substring(0, 100) + "...");
        console.log("🔑 OpenAI API Key present:", !!process.env.OPENAI_API_KEY);
        console.log("🔑 OpenAI API Key length:", process.env.OPENAI_API_KEY?.length || 0);

        // Log channel data that might affect OpenAI call
        console.log("📊 Channel data for OpenAI:", {
          title: collectedData.title,
          subscriberCount: collectedData.subscriberCount,
          videoCount: collectedData.videoCount,
          viewCount: collectedData.viewCount,
          accountAgeText: accountAgeText,
          givenName: googleAccount.given_name
        });

        try {
          // Call OpenAI with the Neria prompt
          console.log("🤖 Calling OpenAI API...");
          const openaiStartTime = Date.now();

          // Create a timeout promise for the OpenAI call
          const openaiPromise = interpretYouTubeData({}, neriaPrompt, 'openai', 'gpt-4o');
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('OpenAI API call timed out after 30 seconds')), 30000);
          });

          neriaResponse = await Promise.race([openaiPromise, timeoutPromise]) as string;
          const openaiEndTime = Date.now();
          const openaiDuration = openaiEndTime - openaiStartTime;

          console.log("✅ OpenAI response received in", openaiDuration, "ms");
          console.log("✅ OpenAI response length:", neriaResponse.length);
          console.log("✅ OpenAI response preview:", neriaResponse.substring(0, 100) + "...");

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
          console.error("❌ Error details:", openaiError instanceof Error ? openaiError.message : 'Unknown error');
          console.error("❌ Error stack:", openaiError instanceof Error ? openaiError.stack : 'No stack trace');

          // Log additional context about the failure
          console.log("❌ Channel data at time of failure:", {
            channelId,
            userId: user.id,
            channelRecordId: channelRecord.id,
            googleAccountId: googleAccount.given_name,
            promptLength: neriaPrompt.length
          });

          // Provide a fallback response so the animation still works
          neriaResponse = `Hi ${googleAccount.given_name}, I can see you've been running ${collectedData.title} for ${accountAgeText}, and you've created ${collectedData.videoCount.toLocaleString()} videos! I'm analyzing your channel data right now to provide you with personalized insights. This might take a moment...`;
          console.log("✅ Using fallback Neria response:", neriaResponse.substring(0, 100) + "...");
        }
      } else {
        console.log("❌ No Google account found for channel:", {
          channelId,
          userId: user.id,
          channelRecordId: channelRecord?.id,
          googleAccountId: channelRecord?.google_account_id,
          googleSub: channelRecord?.google_sub
        });
        console.log("❌ Skipping Neria OpenAI call due to missing Google account");
      }
    } else {
      console.log("❌ No channel record found, cannot generate Neria response");
      console.log("❌ Channel lookup details:", {
        channelId,
        userId: user.id,
        channelRecordExists: !!channelRecord
      });
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
