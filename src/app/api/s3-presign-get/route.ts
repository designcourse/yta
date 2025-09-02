import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { getBucketName, getS3Client } from "@/utils/s3";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");
    if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const s3 = getS3Client();
    const Bucket = getBucketName();
    const command = new GetObjectCommand({ Bucket, Key: key });
    const url = await getSignedUrl(s3, command, { expiresIn: 60 * 5 });
    return NextResponse.json({ url });
  } catch (e) {
    console.error("S3 presign-get error:", e);
    return NextResponse.json({ error: "Failed to create presigned GET URL" }, { status: 500 });
  }
}


