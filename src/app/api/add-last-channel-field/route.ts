import { createSupabaseAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const admin = createSupabaseAdminClient();
    
    // Add the last_channel_used column to google_accounts table
    const { error } = await admin.rpc('execute_sql', {
      sql: `
        ALTER TABLE google_accounts 
        ADD COLUMN IF NOT EXISTS last_channel_used TEXT;
      `
    });

    if (error) {
      console.error("Error adding last_channel_used column:", error);
      return NextResponse.json({ 
        success: false, 
        error: "Failed to add column to database",
        details: error.message 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: "Successfully added last_channel_used column to google_accounts table" 
    });
  } catch (error) {
    console.error("Error in add-last-channel-field API:", error);
    return NextResponse.json({ 
      success: false, 
      error: "Internal server error",
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
