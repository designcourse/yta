import { createSupabaseAdminClient } from "@/utils/supabase/admin";

export interface TokenRefreshResult {
  accessToken: string;
  success: boolean;
  error?: string;
}

export async function refreshGoogleToken(userId: string, refreshToken: string, googleSub?: string): Promise<TokenRefreshResult> {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Token refresh failed:", error);
      return { accessToken: "", success: false, error: "Token refresh failed" };
    }

    const tokens = await response.json();
    const newAccessToken = tokens.access_token;
    const newRefreshToken = tokens.refresh_token || refreshToken; // Google sometimes returns a new refresh token

    // Update the tokens in the database
    const admin = createSupabaseAdminClient();
    if (googleSub) {
      // Update the specific Google account
      await admin.from("google_accounts").update({
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
      }).eq("user_id", userId).eq("google_sub", googleSub);
    } else {
      // Fallback: update any Google account for the user
      await admin.from("google_accounts").update({
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
      }).eq("user_id", userId);
    }

    console.log("Successfully refreshed tokens for user:", userId);
    return { accessToken: newAccessToken, success: true };
  } catch (error) {
    console.error("Token refresh error:", error);
    return { accessToken: "", success: false, error: "Internal error during token refresh" };
  }
}

export async function getValidAccessToken(userId: string, channelId?: string): Promise<TokenRefreshResult> {
  const admin = createSupabaseAdminClient();
  
  let googleAccount = null;
  
  if (channelId) {
    console.log("Looking up token for channel:", channelId, "user:", userId);
    
    // Try to find the specific Google account for this channel
    const { data: channelData, error: channelError } = await admin
      .from("channels")
      .select("google_sub")
      .eq("user_id", userId)
      .eq("channel_id", channelId)
      .single();
    
    console.log("Channel lookup result:", { channelData, channelError });
    
    if (channelData?.google_sub) {
      console.log("Found google_sub for channel:", channelData.google_sub);
      
      // Get tokens for the specific Google account that owns this channel
      const { data: specificAccount, error: accountError } = await admin
        .from("google_accounts")
        .select("access_token, refresh_token, google_sub")
        .eq("user_id", userId)
        .eq("google_sub", channelData.google_sub)
        .single();
      
      console.log("Google account lookup result:", { specificAccount: specificAccount ? "found" : "not found", accountError });
      
      if (specificAccount) {
        googleAccount = specificAccount;
        console.log("Using specific Google account for channel:", channelId, "Google Sub:", channelData.google_sub);
      } else {
        console.log("No google account found for google_sub:", channelData.google_sub);
      }
    } else {
      console.log("No google_sub found for channel:", channelId);
    }
  }
  
  // Fallback: get any Google account for the user (for backward compatibility)
  if (!googleAccount) {
    const { data: fallbackAccount } = await admin
      .from("google_accounts")
      .select("access_token, refresh_token, google_sub")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    
    googleAccount = fallbackAccount;
    console.log("Using fallback Google account for user:", userId);
  }

  if (!googleAccount?.access_token) {
    return { 
      accessToken: "", 
      success: false, 
      error: "No Google access token found" 
    };
  }

  // Try to use the current access token first
  const testResponse = await fetch(
    "https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=" + googleAccount.access_token
  );

  if (testResponse.ok) {
    // Token is still valid
    return { accessToken: googleAccount.access_token, success: true };
  }

  // Token is expired, try to refresh it
  if (!googleAccount.refresh_token) {
    return { 
      accessToken: "", 
      success: false, 
      error: "No refresh token available - please reconnect your YouTube account" 
    };
  }

  return await refreshGoogleToken(userId, googleAccount.refresh_token, googleAccount.google_sub);
}
