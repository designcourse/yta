import { NextResponse } from "next/server";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { getBucketName, getS3Client } from "@/utils/s3";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { fileName, contentType } = await request.json();
    if (!fileName || !contentType) {
      return NextResponse.json({ error: "fileName and contentType are required" }, { status: 400 });
    }

    const s3 = getS3Client();
    const Bucket = getBucketName();

    // Namespace uploads per user
    const Key = `users/${user.id}/thumbnails/${Date.now()}-${fileName}`;

    const command = new PutObjectCommand({ Bucket, Key, ContentType: contentType });
    const url = await getSignedUrl(s3, command, { expiresIn: 60 * 5 });

    const publicBase = process.env.S3_PUBLIC_BASE_URL; // e.g. https://your-bucket.s3.amazonaws.com
    const publicUrl = publicBase ? `${publicBase}/${Key}` : undefined;

    return NextResponse.json({ uploadUrl: url, key: Key, publicUrl });
  } catch (e) {
    console.error("S3 presign error:", e);
    return NextResponse.json({ error: "Failed to create presigned URL" }, { status: 500 });
  }
}


