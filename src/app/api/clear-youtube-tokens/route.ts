import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();
    
    // Clear all YouTube tokens for this user to force fresh reconnection
    const { error } = await admin
      .from("google_accounts")
      .update({ 
        access_token: null, 
        refresh_token: null 
      })
      .eq("user_id", user.id);

    if (error) {
      console.error("Failed to clear tokens:", error);
      return NextResponse.json({ error: "Failed to clear tokens" }, { status: 500 });
    }

    console.log("✅ Cleared YouTube tokens for user:", user.id);
    return NextResponse.json({ success: true, message: "Tokens cleared successfully" });
  } catch (error) {
    console.error("Clear tokens error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

