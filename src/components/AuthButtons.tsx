"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";

export default function AuthButtons() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user?.email ?? null);
    });
  }, [supabase]);

  if (!email) {
    return (
      <button
        className="text-sm px-3 py-1.5 border rounded"
        onClick={async () => {
          const redirectTo = `${window.location.origin}/auth/callback`;
          await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
              scopes: "openid email profile",
              redirectTo,
            },
          });
        }}
      >
        Sign in
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm opacity-75 hidden sm:inline">{email}</span>
      <button
        className="text-sm px-3 py-1.5 border rounded"
        onClick={async () => {
          await supabase.auth.signOut();
          router.push("/");
          router.refresh();
        }}
      >
        Sign out
      </button>
    </div>
  );
}
