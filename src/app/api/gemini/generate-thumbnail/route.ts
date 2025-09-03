import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";
import { getS3Client, getBucketName } from "@/utils/s3";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

// Minimal REST call to Gemini 2.5 Flash Image Preview via fetch
async function callGeminiGenerate({ prompt, textInThumbnail, imagesBase64, forceImage }: { prompt: string; textInThumbnail?: string; imagesBase64: Array<{ data: string; mimeType: string }>; forceImage?: boolean; }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY');

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent';
  const parts: any[] = [];
  
  // Be more explicit about image editing/generation
  let finalText;
  if (imagesBase64.length > 1) {
    // Multiple image editing mode - combine and modify
    finalText = `I am providing ${imagesBase64.length} reference images. Please combine elements from ALL provided images and create a new YouTube thumbnail in 16:9 aspect ratio with these modifications: ${prompt}`;
    if (textInThumbnail) {
      finalText += `\n\nInclude this text prominently in the thumbnail: "${textInThumbnail}"`;
    }
    finalText += `\n\nIMPORTANT: You must blend and modify elements from ALL ${imagesBase64.length} reference images. Do not just copy one image. Create a new composite that transforms and combines visual elements from each provided image according to my instructions. The result should be a completely new, visually striking YouTube thumbnail.`;
  } else if (imagesBase64.length === 1) {
    // Single image editing mode
    finalText = `Using the provided reference image, create a new YouTube thumbnail in 16:9 aspect ratio that incorporates the following changes: ${prompt}`;
    if (textInThumbnail) {
      finalText += `\n\nInclude this text prominently in the thumbnail: "${textInThumbnail}"`;
    }
    finalText += `\n\nIMPORTANT: Modify and transform the provided image as requested. Do not simply copy it unchanged. Apply the requested modifications while maintaining the overall composition style. The result should be a visually striking YouTube thumbnail.`;
  } else {
    // Pure generation mode - no reference images
    finalText = `Generate a YouTube thumbnail image in a 16:9 aspect ratio based on this request: ${prompt}`;
    if (textInThumbnail) {
      finalText += `\n\nInclude this text in the thumbnail: "${textInThumbnail}"`;
    }
  }
  finalText += `\n\nOutput: Return a single 16:9 aspect ratio image suitable for YouTube thumbnails. Do not include any text explanations in your response.`;
  
  parts.push({ text: finalText });
  for (const img of imagesBase64) {
    parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } });
  }
  
  console.log('[Gemini] Sending request with', parts.length, 'parts:', {
    textLength: finalText.length,
    imageCount: imagesBase64.length
  });

  const res = await fetch(url + `?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        candidateCount: 1
      }
    })
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gemini error: ${res.status} ${txt}`);
  }
  const json = await res.json();
  // Extract image from response in either snake_case or camelCase
  const partsOut = json?.candidates?.[0]?.content?.parts || [];
  const imgPart = partsOut.find((p: any) => {
    const d = p?.inline_data?.data || p?.inlineData?.data || p?.data;
    const mt = p?.inline_data?.mime_type || p?.inlineData?.mimeType || p?.mimeType;
    return d && (mt?.startsWith?.('image/') || true);
  });
  const firstImageBase64 = imgPart?.inline_data?.data || imgPart?.inlineData?.data || imgPart?.data;
  const mime = imgPart?.inline_data?.mime_type || imgPart?.inlineData?.mimeType || imgPart?.mimeType || 'image/png';
  if (!firstImageBase64) {
    console.warn('[Gemini] No inline image returned. Raw response summary:', {
      hasCandidates: Array.isArray(json?.candidates),
      partsCount: partsOut.length,
      firstPartKeys: partsOut[0] ? Object.keys(partsOut[0]) : [],
      firstPartText: partsOut[0]?.text?.substring(0, 200) + '...'
    });
  }
  return { base64: firstImageBase64 as string | undefined, mimeType: mime };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prompt, textInThumbnail, referencePhotoIds, channelId, editFileKey } = body as { prompt: string; textInThumbnail?: string; referencePhotoIds: string[]; channelId: string; editFileKey?: string };
    if (!prompt || !channelId) return NextResponse.json({ error: 'prompt and channelId required' }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    // Resolve channel row
    const { data: ch } = await supabase
      .from('channels')
      .select('id')
      .eq('channel_id', channelId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!ch) return NextResponse.json({ error: 'Channel not found' }, { status: 404 });

    // Load reference photo file keys and fetch presigned GET to download bytes
    const ids = Array.isArray(referencePhotoIds) ? referencePhotoIds.slice(0, 3) : [];
    let items: Array<{ file_key: string; content_type?: string | null }> = [];
    if (ids.length > 0) {
      const { data: rows } = await supabase
        .from('reference_photos')
        .select('file_key, content_type')
        .in('id', ids);
      items = rows || [];
    }

    // Download each image directly from S3 (server-side)
    const s3 = getS3Client();
    const Bucket = getBucketName();
    const imagePayload: Array<{ data: string; mimeType: string }> = [];
    async function readStreamToBuffer(stream: any): Promise<Buffer> {
      const chunks: Uint8Array[] = [];
      for await (const chunk of stream) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    }
    for (const it of items) {
      try {
        const out = await s3.send(new GetObjectCommand({ Bucket, Key: it.file_key }));
        // Node: Body is a Readable stream
        // @ts-ignore
        const bodyStream = out.Body;
        if (!bodyStream) continue;
        const buf = await readStreamToBuffer(bodyStream);
        const b64 = buf.toString('base64');
        imagePayload.push({ data: b64, mimeType: it.content_type || 'image/jpeg' });
      } catch (e) {
        console.warn('S3 getObject failed', it.file_key, e);
      }
    }

    // If editing an already generated image, include it as the first image for multi-turn editing
    if (editFileKey) {
      try {
        const out = await s3.send(new GetObjectCommand({ Bucket, Key: editFileKey }));
        // @ts-ignore
        const bodyStream = out.Body;
        if (bodyStream) {
          const chunks: Uint8Array[] = [];
          // @ts-ignore
          for await (const chunk of bodyStream) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
          }
          const buf = Buffer.concat(chunks);
          const b64 = buf.toString('base64');
          const mimeType = (out as any)?.ContentType || 'image/png';
          imagePayload.unshift({ data: b64, mimeType });
        }
      } catch (e) {
        console.warn('S3 getObject failed for editFileKey', editFileKey, e);
      }
    }

    let base64: string | undefined;
    let mimeType: string | undefined;
    try {
      // Attempt 1
      const r1 = await callGeminiGenerate({ prompt, textInThumbnail, imagesBase64: imagePayload });
      base64 = r1.base64;
      mimeType = r1.mimeType;
      // If no image returned, attempt again with explicit image-only config/instruction
      if (!base64) {
        const strongPrompt = `${prompt}\n\nCreate a single 16:9 YouTube thumbnail image. If text is provided, render it in the thumbnail. Return an image output only; do not include any text responses.`;
        const r2 = await callGeminiGenerate({ prompt: strongPrompt, textInThumbnail, imagesBase64: imagePayload, forceImage: true });
        base64 = r2.base64;
        mimeType = r2.mimeType;
      }
    } catch (err: any) {
      const msg = String(err?.message || err || 'Gemini error');
      console.error('=== GEMINI GENERATION ERROR ===');
      console.error('Error message:', msg);
      console.error('Full error object:', err);
      console.error('=== END ERROR ===');
      
      // Bubble up rate limit so client can show a friendly message
      if (msg.includes('429') || msg.toLowerCase().includes('quota')) {
        return NextResponse.json({ error: 'rate_limited', message: 'Gemini API rate limit or quota exceeded. Please add billing or wait and retry.' }, { status: 429 });
      }
      return NextResponse.json({ error: 'generation_failed', message: `Failed to generate image: ${msg}` }, { status: 502 });
    }
    
    console.log('=== GEMINI RESULT ===');
    console.log('Got base64 image:', !!base64);
    console.log('Base64 length:', base64?.length || 0);
    console.log('MIME type:', mimeType);
    console.log('=== END RESULT ===');
    
    if (!base64) {
      console.error('=== NO IMAGE RETURNED ===');
      return NextResponse.json({ 
        error: 'no_image', 
        message: 'The model did not return an image. Try rewording your instruction (e.g., "generate a 16:9 YouTube thumbnail image with [text]").' 
      }, { status: 422 });
    }

    // Upload generated image to S3 directly
    const Key = `users/${user.id}/thumbnails/${Date.now()}-gemini.png`;
    const bytes = Buffer.from(base64, 'base64');
    
    console.log('=== S3 UPLOAD ===');
    console.log('Key:', Key);
    console.log('Bytes length:', bytes.length);
    console.log('Bucket:', Bucket);
    
    try {
      await s3.send(new PutObjectCommand({ Bucket, Key, Body: bytes, ContentType: mimeType || 'image/png' }));
      console.log('S3 upload successful');
    } catch (s3Error) {
      console.error('=== S3 UPLOAD FAILED ===');
      console.error('S3 Error:', s3Error);
      return NextResponse.json({ error: 'S3 upload failed', message: 'Failed to upload generated image to storage.' }, { status: 500 });
    }
    
    const publicBase = process.env.S3_PUBLIC_BASE_URL;
    const publicUrl = publicBase ? `${publicBase}/${Key}` : undefined;
    
    console.log('Public URL:', publicUrl);

    // Save record in a new table video_thumbnails (user-scoped, but not final selection)
    console.log('=== DATABASE SAVE ===');
    const admin = createSupabaseAdminClient();
    const { data: inserted, error } = await admin
      .from('video_thumbnails')
      .insert({ user_id: user.id, channel_id: ch.id, file_key: Key, url: publicUrl })
      .select('id, file_key, url')
      .single();
      
    if (error) {
      console.error('=== DATABASE SAVE FAILED ===');
      console.error('DB Error:', error);
      return NextResponse.json({ error: 'Failed to save generated thumbnail', message: 'Database save failed.' }, { status: 500 });
    }
    
    console.log('=== SUCCESS ===');
    console.log('Inserted record:', inserted);

    return NextResponse.json({ generated: [inserted] });
  } catch (e) {
    console.error('generate-thumbnail error', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}


