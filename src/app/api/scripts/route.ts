import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { getClient } from "@/utils/openai";

type GenerateBody = {
  planId: string;
  prompt: string;
  desiredMinutes?: number;
  sectionsRequested?: number;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const planId = searchParams.get("planId");
    if (!planId) return NextResponse.json({ error: "planId required" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Ensure this plan belongs to user
    const { data: plan } = await supabase
      .from("video_plans")
      .select("id, user_id")
      .eq("id", planId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!plan) return NextResponse.json({ script: null });

    const { data: script } = await supabase
      .from("scripts")
      .select("id, status, duration_seconds, requested_prompt, model")
      .eq("video_plan_id", planId)
      .maybeSingle();

    if (!script) return NextResponse.json({ script: null });

    const { data: sections } = await supabase
      .from("script_sections")
      .select("id, position, start_time_seconds, title, summary")
      .eq("script_id", script.id)
      .order("position", { ascending: true });

    const { data: resources } = await supabase
      .from("section_resources")
      .select("id, section_id, label, url, position")
      .in("section_id", (sections || []).map(s => s.id));

    const bySection: Record<string, any[]> = {};
    (resources || []).forEach(r => {
      bySection[r.section_id] ||= [];
      bySection[r.section_id].push(r);
    });

    const assembled = {
      ...script,
      sections: (sections || []).map(s => ({
        id: s.id,
        position: s.position,
        start_time_seconds: s.start_time_seconds,
        title: s.title,
        summary: s.summary,
        resources: (bySection[s.id] || []).sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      }))
    };

    return NextResponse.json({ script: assembled });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateBody;
    if (!body?.planId || !body?.prompt) {
      return NextResponse.json({ error: "planId and prompt required" }, { status: 400 });
    }

    const desiredMinutes = Math.max(1, Math.min(60, body.desiredMinutes || 8));
    const sectionsRequested = body.sectionsRequested && body.sectionsRequested > 0 ? Math.min(20, body.sectionsRequested) : undefined;

    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Validate ownership of plan
    const { data: plan } = await supabase
      .from("video_plans")
      .select("id, title, summary, user_id")
      .eq("id", body.planId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

    // Upsert script row (one per plan). If exists, delete to regenerate cleanly.
    const { data: existing } = await supabase
      .from("scripts")
      .select("id")
      .eq("video_plan_id", body.planId)
      .maybeSingle();

    if (existing?.id) {
      // Deleting cascades sections/resources due to FK
      await supabase.from("scripts").delete().eq("id", existing.id);
    }

    const model = "gpt-4o";
    const insertRes = await supabase
      .from("scripts")
      .insert({ video_plan_id: body.planId, status: "generating", requested_prompt: body.prompt, model, duration_seconds: desiredMinutes * 60 })
      .select("id")
      .single();

    const scriptId = insertRes.data?.id as string;

    const client = getClient("openai");
    const system = `You are Neria, a YouTube content planning assistant. Create a high-level video script broken into sections. Each section has: start_time_seconds (integer), title, summary (single paragraph), and up to 5 resource links {label,url}. Focus on guidance for creators, not word-for-word dialogue. Output ONLY strict JSON matching this TypeScript type:\n{\n  "duration_seconds": number,\n  "sections": Array<{\n    "start_time_seconds": number,\n    "title": string,\n    "summary": string,\n    "resources": Array<{"label": string, "url": string}>\n  }>\n}`;

    const userPrompt = `Video title: ${plan.title}\n\nVideo summary: ${plan.summary}\n\nUser request: ${body.prompt}\n\nDesired total duration: ~${desiredMinutes} minutes${sectionsRequested ? `\nDesired sections: ${sectionsRequested}` : ''}. If not specified, choose a reasonable number of sections. Ensure the first section starts at 0 seconds.`;

    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 1500
    });

    const raw = (completion.choices?.[0]?.message?.content || "").trim();
    if (!raw) {
      await supabase.from("scripts").update({ status: "error" }).eq("id", scriptId);
      return NextResponse.json({ error: "Empty response from model" }, { status: 500 });
    }

    // Extract JSON from response
    let jsonText = raw;
    const fenceMatch = raw.match(/```(?:json)?\n([\s\S]*?)\n```/);
    if (fenceMatch) jsonText = fenceMatch[1];

    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      // Attempt to salvage by finding first and last braces
      const first = raw.indexOf("{");
      const last = raw.lastIndexOf("}");
      if (first >= 0 && last > first) {
        parsed = JSON.parse(raw.slice(first, last + 1));
      } else {
        await supabase.from("scripts").update({ status: "error" }).eq("id", scriptId);
        return NextResponse.json({ error: "Failed to parse model JSON" }, { status: 500 });
      }
    }

    const sections: Array<any> = Array.isArray(parsed?.sections) ? parsed.sections : [];

    // Helper: fetch up to 5 authoritative URLs for this section using Perplexity
    const fetchSectionResources = async (title: string, summary: string): Promise<Array<{ label?: string; url: string }>> => {
      try {
        const perplexity = getClient('perplexity');
        const model = 'sonar-pro';
        const messages = [
          {
            role: 'system' as const,
            content:
              'You are a real-time research assistant. Return only STRICT JSON: {"links":[{"label":string,"url":string}, ...]} with 3-5 authoritative, working URLs that help research the topic. No prose, no backticks. Prefer docs, standards, reputable publications. Use concise labels.',
          },
          {
            role: 'user' as const,
            content: `Provide research links for a YouTube video section.\nVideo title: ${plan.title}\nSection title: ${title}\nSection summary: ${summary}`,
          },
        ];
        const completion = await perplexity.chat.completions.create({ model, messages, max_tokens: 600, temperature: 0 });
        let raw = completion.choices?.[0]?.message?.content || '';
        raw = raw.trim().replace(/```json|```/g, '').trim();
        const first = raw.indexOf('{');
        const last = raw.lastIndexOf('}');
        const jsonText = first >= 0 && last > first ? raw.slice(first, last + 1) : raw;
        const parsed = JSON.parse(jsonText);
        const arr = Array.isArray(parsed?.links) ? parsed.links : [];
        // Basic URL validation
        return arr
          .map((x: any) => ({ label: typeof x?.label === 'string' ? x.label : undefined, url: String(x?.url || '') }))
          .filter((x: any) => /^https?:\/\//i.test(x.url))
          .slice(0, 5);
      } catch {
        return [];
      }
    };

    // Insert sections
    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      const { data: secRow } = await supabase
        .from("script_sections")
        .insert({
          script_id: scriptId,
          position: i + 1,
          start_time_seconds: Number(sec.start_time_seconds) || (i === 0 ? 0 : i * 60),
          title: String(sec.title || `Section ${i + 1}`),
          summary: String(sec.summary || "")
        })
        .select("id")
        .single();

      const secId = secRow?.id as string;
      // Replace hallucinated resources with real-time links from Perplexity
      const resources = await fetchSectionResources(String(sec.title || `Section ${i + 1}`), String(sec.summary || ""));
      for (let r = 0; r < resources.length; r++) {
        const res = resources[r];
        const label = res.label && res.label.trim().length > 0 ? res.label : (() => { try { return new URL(res.url).hostname.replace(/^www\./, ''); } catch { return 'Resource'; } })();
        await supabase
          .from("section_resources")
          .insert({ section_id: secId, label, url: res.url, position: r + 1 });
      }
    }

    await supabase.from("scripts").update({ status: "ready" }).eq("id", scriptId);

    return NextResponse.json({ status: "ready", scriptId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}


