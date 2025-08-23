import { createSupabaseServerClient } from "@/utils/supabase/server";
import Link from "next/link";

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // If user is already signed in, redirect to dashboard
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-4">Welcome back!</h1>
          <p className="mb-4 opacity-80">You're already signed in as {user.email}</p>
          <Link 
            href="/dashboard"
            className="inline-block px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid place-items-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">YouTube Analytics</h1>
        <p className="text-lg mb-8 opacity-80">
          Connect your YouTube channel and get AI-powered insights
        </p>
        <Link 
          href="/auth/signin"
          className="inline-block px-8 py-4 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors text-lg font-medium"
        >
          Get Started
        </Link>
      </div>
    </div>
  );
}