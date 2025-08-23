import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://vmgjrvwwfcomhexlgwds.supabase.co";
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtZ2pydnd3ZmNvbWhleGxnd2RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU5NTEyNjksImV4cCI6MjA3MTUyNzI2OX0.UHvJ5XkgzeRzpeAFmIli6DZyXpux8UZnSTuzdESYSNY";

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: any) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {}
      },
      remove(name: string, options: any) {
        try {
          cookieStore.delete({ name, ...options });
        } catch {}
      },
    },
  });
}
