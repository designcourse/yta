import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";
import { getClient } from "@/utils/openai";
import { getPrompt } from "@/utils/prompts";

async function loadChannelContext(supabase: any, userId: string, externalChannelId: string) {
  const { data: channelMeta, error: chErr } = await supabase
    .from("channels")
    .select("id, title, channel_id")
    .eq("channel_id", externalChannelId)
    .eq("user_id", userId)
    .single();
  if (chErr || !channelMeta) return null;

  const { data: ctxRows } = await supabase
    .from("neria_context")
    .select("prompt_type, prompt_text")
    .eq("channel_id", channelMeta.id);

  const aboutText = (ctxRows || []).find((r: any) => r.prompt_type === "channel_about")?.prompt_text || "";
  
  let recentTitles: string[] = [];
  try {
    const raw = (ctxRows || []).find((r: any) => r.prompt_type === "recent_video_titles")?.prompt_text;
    if (raw) recentTitles = JSON.parse(raw);
  } catch {}

  return { channelMeta, aboutText, recentTitles };
}

async function generateVideoSummary(videoTitle: string, context: { channelMeta: any; aboutText: string; recentTitles: string[] }): Promise<string> {
  try {
    const client = getClient("openai");
    const systemPrompt = await getPrompt('video_plan_summary');
    
    const userPrompt = `Generate a compelling 2-3 sentence summary for this video idea:

Title: "${videoTitle}"
Channel: ${context.channelMeta.title}
About: ${context.aboutText || 'Not provided'}
Recent Videos: ${context.recentTitles.slice(0, 5).join(', ') || 'None available'}

Create a summary that:
1. Explains what the video will cover in an engaging way
2. Highlights the value viewers will get
3. Fits the channel's style and audience
4. Is 2-3 sentences maximum

Return ONLY the summary text, no additional formatting or quotation marks.`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 200,
      temperature: 0.7,
    });

    const summary = completion.choices?.[0]?.message?.content?.trim() || '';
    return summary || `Draft plan for "${videoTitle}". You can refine this later.`;
  } catch (error) {
    console.error('[VideoPlans] Error generating summary:', error);
    return `Draft plan for "${videoTitle}". You can refine this later.`;
  }
}

export async function POST(request: Request) {
  try {
    const { channelId, ideaId, customTitle } = await request.json();
    if (!channelId) {
      return NextResponse.json({ error: "channelId is required" }, { status: 400 });
    }
    if (!ideaId && !customTitle) {
      return NextResponse.json({ error: "Either ideaId or customTitle is required" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const ctx = await loadChannelContext(supabase, user.id, channelId);
    if (!ctx) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

    const admin = createSupabaseAdminClient();
    
    let videoTitle: string;
    let videoIdeaId: string | null = null;
    
    if (customTitle) {
      // Custom video title provided
      videoTitle = customTitle;
    } else {
      // Fetch from video_planner_ideas
      const { data: ideaRow, error: ideaErr } = await admin
        .from("video_planner_ideas")
        .select("id, title")
        .eq("id", ideaId)
        .eq("channel_id", ctx.channelMeta.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (ideaErr || !ideaRow) return NextResponse.json({ error: "Idea not found" }, { status: 404 });
      videoTitle = ideaRow.title;
      videoIdeaId = ideaRow.id;
    }

    // Generate AI summary for the video plan
    const summary = await generateVideoSummary(videoTitle, ctx);

    const insertPayload = {
      user_id: user.id,
      channel_id: ctx.channelMeta.id,
      idea_id: videoIdeaId,
      title: videoTitle,
      summary,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Insert plan
    const { data: planRows, error: insErr } = await admin
      .from("video_plans")
      .insert(insertPayload)
      .select("id")
      .single();
    if (insErr || !planRows) return NextResponse.json({ error: "Failed to create plan" }, { status: 500 });

    // If this is the first plan for this user+channel, auto-mark as next
    try {
      const { data: countRows } = await admin
        .from('video_plans')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('channel_id', ctx.channelMeta.id);
      const total = (countRows as any)?.length ?? (countRows as any)?.count ?? undefined;
      // Fallback: if cannot get exact count, check if no other is_next exists
      let shouldMark = false;
      if (typeof total === 'number') {
        shouldMark = total === 1;
      } else {
        const { data: anyNext } = await admin
          .from('video_plans')
          .select('id')
          .eq('user_id', user.id)
          .eq('channel_id', ctx.channelMeta.id)
          .eq('is_next', true)
          .maybeSingle();
        shouldMark = !anyNext;
      }
      if (shouldMark) {
        await admin
          .from('video_plans')
          .update({ is_next: true })
          .eq('id', planRows.id);
        // Update cached bundle in-place if present; avoid full rebuild
        const { getCachedContextBundle, patchNeriaContextNextVideo, invalidateNeriaContextCache } = await import("@/utils/neria-context");
        const cached = await getCachedContextBundle(ctx.channelMeta.id);
        if (cached) {
          await patchNeriaContextNextVideo(ctx.channelMeta.id, {
            title: insertPayload.title,
            planId: planRows.id,
            hasThumbnail: false,
            hasOutline: false,
          });
        } else {
          await invalidateNeriaContextCache(ctx.channelMeta.id);
        }
      }
    } catch {}

    return NextResponse.json({ planId: planRows.id });
  } catch (error) {
    console.error("Create video plan error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const channelId = searchParams.get("channelId");

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    if (id) {
      const { data: plan, error } = await supabase
        .from("video_plans")
        .select("id, title, summary, created_at, updated_at, channel_id, idea_id, thumbnail_url, thumbnail_selected_at, is_next")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error || !plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ plan });
    }

    if (!channelId) return NextResponse.json({ error: "id or channelId required" }, { status: 400 });

    // Find internal channel UUID for this user
    const { data: ch, error: chErr } = await supabase
      .from("channels")
      .select("id")
      .eq("channel_id", channelId)
      .eq("user_id", user.id)
      .single();
    if (chErr || !ch) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

    const { data: plans, error: listErr } = await supabase
      .from("video_plans")
      .select("id, title, summary, created_at, updated_at, thumbnail_url, thumbnail_selected_at, is_next")
      .eq("user_id", user.id)
      .eq("channel_id", ch.id)
      .order("created_at", { ascending: false });
    if (listErr) return NextResponse.json({ error: "Failed to load plans" }, { status: 500 });

    return NextResponse.json({ plans: plans || [] });
  } catch (error) {
    console.error("Fetch video plan error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Verify ownership before deleting
    const { data: plan } = await supabase
      .from('video_plans')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    
    if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

    // Delete the plan (cascading deletes will handle related records like scripts)
    const { error } = await supabase
      .from('video_plans')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) return NextResponse.json({ error: "Failed to delete" }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Delete video plan error:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { id, thumbnail_url, mark_next } = await request.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // If mark_next requested, ensure only this plan is_next within user+channel
    if (mark_next === true) {
      // Fetch channel_id for this plan
      const { data: planRow, error: planErr } = await supabase
        .from('video_plans')
        .select('id, channel_id, title, thumbnail_url')
        .eq('id', id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (planErr || !planRow) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });

      // Clear existing next in same user+channel
      await supabase
        .from('video_plans')
        .update({ is_next: false })
        .eq('user_id', user.id)
        .eq('channel_id', planRow.channel_id)
        .eq('is_next', true);

      // Set this plan as next
      await supabase
        .from('video_plans')
        .update({ is_next: true })
        .eq('id', id)
        .eq('user_id', user.id);

      // Update cached bundle in-place if present; avoid full rebuild
      const { getCachedContextBundle, patchNeriaContextNextVideo, invalidateNeriaContextCache } = await import("@/utils/neria-context");
      const cached = await getCachedContextBundle(planRow.channel_id);
      if (cached) {
        // Check outline status
        let hasOutline = false;
        try {
          const { data: script } = await supabase
            .from('scripts')
            .select('id')
            .eq('video_plan_id', id)
            .maybeSingle();
          hasOutline = !!script?.id;
        } catch {}
        await patchNeriaContextNextVideo(planRow.channel_id, {
          title: planRow.title || '',
          planId: id,
          hasThumbnail: !!planRow.thumbnail_url,
          hasOutline,
        });
      } else {
        await invalidateNeriaContextCache(planRow.channel_id);
      }
    }

    if (thumbnail_url !== undefined) {
      const { data, error } = await supabase
        .from('video_plans')
        .update({ thumbnail_url, thumbnail_selected_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', user.id)
        .select('id, title, thumbnail_url, thumbnail_selected_at, is_next, channel_id')
        .single();
      if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 });
      
      // Update Neria's context if this is the next video
      if (data?.is_next && data?.channel_id) {
        try {
          // Check if this plan has an outline
          let hasOutline = false;
          try {
            const { data: script } = await supabase
              .from('scripts')
              .select('id')
              .eq('video_plan_id', id)
              .eq('status', 'ready')
              .maybeSingle();
            hasOutline = !!script?.id;
          } catch {}
          
          await patchNeriaContextNextVideo(data.channel_id, {
            title: data.title || '',
            planId: id,
            hasThumbnail: !!data.thumbnail_url,
            hasOutline,
          });
        } catch (err) {
          console.error('[VideoPlans] Failed to update Neria context after thumbnail update:', err);
        }
      }
      
      return NextResponse.json({ plan: data });
    }

    const { data, error } = await supabase
      .from('video_plans')
      .select('id, thumbnail_url, thumbnail_selected_at, is_next')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error || !data) return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    return NextResponse.json({ plan: data });
  } catch (e) {
    console.error('Update video plan error:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}


