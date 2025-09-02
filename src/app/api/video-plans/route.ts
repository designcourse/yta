import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";
import { getClient } from "@/utils/openai";
import { getPrompt, renderTemplate } from "@/utils/prompts";

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

  return { channelMeta, aboutText };
}

export async function POST(request: Request) {
  try {
    const { channelId, ideaId } = await request.json();
    if (!channelId || !ideaId) {
      return NextResponse.json({ error: "channelId and ideaId are required" }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const ctx = await loadChannelContext(supabase, user.id, channelId);
    if (!ctx) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

    const admin = createSupabaseAdminClient();
    const { data: ideaRow, error: ideaErr } = await admin
      .from("video_planner_ideas")
      .select("id, title")
      .eq("id", ideaId)
      .eq("channel_id", ctx.channelMeta.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (ideaErr || !ideaRow) return NextResponse.json({ error: "Idea not found" }, { status: 404 });

    const template = await getPrompt("video_plan_summary");
    const finalSystem = renderTemplate(template, {
      video_title: ideaRow.title,
      channel_about: ctx.aboutText || "",
    });

    const modelConfig = { provider: "openai", model: "gpt-4o" } as const;
    const client = getClient(modelConfig.provider);
    const completion = await client.chat.completions.create({
      model: modelConfig.model,
      messages: [
        { role: "system", content: finalSystem },
        { role: "user", content: "Provide the 3-sentence elaboration now." },
      ],
      max_tokens: 220,
      temperature: 0.5,
    });
    const summary = (completion.choices?.[0]?.message?.content || "").trim();
    if (!summary) return NextResponse.json({ error: "Failed to generate summary" }, { status: 500 });

    const insertPayload = {
      user_id: user.id,
      channel_id: ctx.channelMeta.id,
      idea_id: ideaRow.id,
      title: ideaRow.title,
      summary,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: planRows, error: insErr } = await admin
      .from("video_plans")
      .insert(insertPayload)
      .select("id")
      .single();
    if (insErr || !planRows) return NextResponse.json({ error: "Failed to create plan" }, { status: 500 });

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
        .select("id, title, summary, created_at, updated_at, channel_id, idea_id, thumbnail_url, thumbnail_selected_at")
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
      .select("id, title, summary, created_at, updated_at, thumbnail_url, thumbnail_selected_at")
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


