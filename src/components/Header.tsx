"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/utils/supabase/client";

export default function Header() {
  const supabase = createSupabaseBrowserClient();
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    let componentMounted = true;

    // Get initial session
    supabase.auth.getSession().then(({ data }) => {
      if (!componentMounted) return;
      setIsSignedIn(!!data.session);
    });

    // Listen for auth changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsSignedIn(!!session);
    });

    return () => {
      componentMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  return (
    <header className="pointer-events-auto p-12 h-20 flex items-center">
      <div className="flex items-center justify-between w-full">
        <Link href="/" className="flex items-center gap-3" aria-label="Home">
          <Image
            src={"/figma/1dfe67554ca7f3ba9d90033c44cc1cc16941b0a2.svg"}
            alt="Neria"
            width={100}
            height={14}
            priority
          />
        </Link>

        {!isSignedIn ? (
          <button
            className="inline-flex items-center gap-2 text-[19px] font-bold text-black"
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
            <GoogleIcon className="h-[22px] w-[22px]" />
            Login
          </button>
        ) : (
          <button
            className="inline-flex items-center gap-2 text-sm border rounded px-3 py-1.5"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/";
            }}
          >
            Sign out
          </button>
        )}
      </div>
    </header>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 533.5 544.3" className={className} aria-hidden="true">
      <path fill="#EA4335" d="M533.5 278.4c0-18.5-1.5-32-4.8-46.1H272.1v87.2h149.7c-3 21.6-19.2 54.1-55.2 76.1l-.5 3.2 80.1 62 5.6.5c51.4-47.4 81.7-117.3 81.7-183.1z"/>
      <path fill="#34A853" d="M272.1 544.3c73.9 0 135.9-24.3 181.2-66.2l-86.3-66.8c-23.1 15.9-54.2 27-94.9 27-72.5 0-134-47.9-155.9-114l-3.2.3-84.4 65.4-1.1 3.1c45 89.5 137.2 150.2 244.6 150.2z"/>
      <path fill="#4A90E2" d="M116.2 324.6c-5.8-17.4-9.1-36-9.1-55.1s3.3-37.7 9-55.1l-.2-3.7-85.6-66.6-2.8 1.3C9.1 181.2 0 216.1 0 259.5s9.1 78.3 27.5 114.1l88.7-69z"/>
      <path fill="#FBBC05" d="M272.1 107.7c51.4 0 86 22.1 105.8 40.6l77.2-75.3C407.9 28.2 346 0 272.1 0 164.7 0 72.5 60.7 27.5 150.2l88.7 69c21.9-66.1 83.4-111.5 155.9-111.5z"/>
    </svg>
  );
}


