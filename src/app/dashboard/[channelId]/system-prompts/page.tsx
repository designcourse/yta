import { createSupabaseServerClient } from "@/utils/supabase/server";
import Link from "next/link";
import { revalidatePath } from "next/cache";

export default async function SystemPromptsPage({ params }: { params: { channelId: string } }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Admin check
  const { data: roleRow } = await supabase
    .from('google_accounts')
    .select('role_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  const { data: roles } = await supabase.from('user_roles').select('id,name');
  const adminRoleId = roles?.find(r => r.name === 'admin')?.id;
  const isAdmin = !!adminRoleId && roleRow?.role_id === adminRoleId;
  if (!isAdmin) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold mb-2">System Prompts</h1>
        <p className="text-gray-600">You do not have permission to view this page.</p>
      </div>
    );
  }

  const { data } = await supabase
    .from('system_prompts')
    .select('key,label,description,template,updated_at');

  // Custom sort: onboarding collection prompts first, then others by label/key
  const ordered = (data || []).slice().sort((a: any, b: any) => {
    const onboardingKeys = new Set(['collection_greeting', 'neria_next_question_instruction']);
    const aOn = onboardingKeys.has(a.key) ? 0 : 1;
    const bOn = onboardingKeys.has(b.key) ? 0 : 1;
    if (aOn !== bOn) return aOn - bOn;
    const aName = (a.label || a.key || '').toLowerCase();
    const bName = (b.label || b.key || '').toLowerCase();
    return aName.localeCompare(bName);
  });

  async function savePrompt(formData: FormData) {
    'use server';
    const key = formData.get('key') as string;
    const template = formData.get('template') as string;
    const supabaseAction = await createSupabaseServerClient();
    const { data: { user: actionUser } } = await supabaseAction.auth.getUser();
    if (!actionUser) throw new Error('Not authenticated');
    const { error } = await supabaseAction
      .from('system_prompts')
      .update({ template, updated_at: new Date().toISOString(), updated_by: actionUser.id })
      .eq('key', key);
    if (error) throw new Error(error.message);
    revalidatePath(`/dashboard/${encodeURIComponent(params.channelId)}/system-prompts`);
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">System Prompts</h1>
        <Link href={`/dashboard/${encodeURIComponent(params.channelId)}`} className="text-blue-600">Back</Link>
      </div>

      <p className="text-gray-600">Edit existing prompts. Creation/deletion is disabled.</p>

      <div className="space-y-10">
        {ordered.map((p) => (
          <form action={savePrompt} key={p.key} className="border rounded p-4 space-y-3 bg-white">
            <input type="hidden" name="key" value={p.key} />
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium">{p.label || p.key}</h2>
                {p.description && <p className="text-gray-500 text-[14px] leading-snug max-w-[70ch]">{p.description}</p>}
              </div>
              <div className="text-xs text-gray-500">Updated: {p.updated_at ? new Date(p.updated_at).toLocaleString() : '—'}</div>
            </div>
            <textarea
              name="template"
              defaultValue={p.template}
              rows={10}
              className="w-full border rounded p-2 font-mono text-sm"
            />
            <div className="flex gap-2 justify-end">
              <button type="submit" className="px-3 py-1.5 rounded bg-gray-900 text-white">Save</button>
            </div>
          </form>
        ))}
      </div>
    </div>
  );
}


