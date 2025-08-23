"use client";

import { createSupabaseBrowserClient } from "@/utils/supabase/client";

export default function SignInPage() {
  const supabase = createSupabaseBrowserClient();

  const handleSignIn = async () => {
    const redirectTo = `${window.location.origin}/auth/callback`;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: "openid email profile",
        redirectTo,
      },
    });
  };

  return (
    <div className="min-h-screen grid place-items-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold mb-4">Sign in to YouTube Analytics</h1>
        <p className="mb-6 opacity-80">
          Sign in with your Google account to get started
        </p>
        <button
          onClick={handleSignIn}
          className="px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
        >
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
