import { NextResponse } from "next/server";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { getBucketName, getS3Client } from "@/utils/s3";

// POST /api/videos/prepublish/init { channelId, planId?, fileName, contentType }
// Returns a short-lived presigned S3 PUT URL for the raw video upload.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { channelId, planId, fileName, contentType } = body as {
      channelId?: string;
      planId?: string;
      fileName?: string;
      contentType?: string;
    };
    if (!fileName || !contentType) {
      return NextResponse.json({ error: "fileName and contentType required" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Optional: validate channel ownership if provided
    if (channelId) {
      const { data: ch } = await supabase
        .from("channels")
        .select("id")
        .eq("channel_id", channelId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!ch) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    // Namespaced object key
    const s3 = getS3Client();
    const Bucket = getBucketName();
    const sanitized = String(fileName).replace(/[^a-zA-Z0-9_.\-]/g, "_");
    const Key = `users/${user.id}/prepublish/${Date.now()}-${sanitized}`;

    const command = new PutObjectCommand({ Bucket, Key, ContentType: contentType });
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 60 * 10 });

    return NextResponse.json({ uploadUrl, key: Key });
  } catch (e) {
    console.error("[prepublish:init] error", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}


