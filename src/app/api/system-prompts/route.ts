import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data, error } = await supabase
    .from('system_prompts')
    .select('key,label,description,template,updated_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prompts: data || [] });
}

export async function PUT(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => null) as { key?: string; template?: string } | null;
  if (!body?.key || typeof body.template !== 'string') {
    return NextResponse.json({ error: "key and template are required" }, { status: 400 });
  }

  // Soft auth check for admin: verify user's google_accounts role is admin
  const { data: adminCheck } = await supabase
    .from('google_accounts')
    .select('role_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!adminCheck) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: roleRows } = await supabase
    .from('user_roles')
    .select('id,name');
  const adminRole = roleRows?.find(r => r.name === 'admin');
  if (!adminRole || adminCheck.role_id !== adminRole.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from('system_prompts')
    .update({ template: body.template, updated_at: new Date().toISOString(), updated_by: user.id })
    .eq('key', body.key);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}


