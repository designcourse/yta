import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  let next = searchParams.get("next") ?? "/dashboard";
  if (!next.startsWith("/")) next = "/dashboard";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      try {
        const admin = createSupabaseAdminClient();
        const session = data?.session;
        const user = session?.user;

        if (user) {
          const googleIdentity = user.identities?.find((i) => i.provider === "google");
          const googleSub = (googleIdentity?.identity_data as any)?.sub as string | undefined;

          // Store/update the Google account WITHOUT YouTube tokens - just basic info
          await admin.from("google_accounts").upsert(
            {
              user_id: user.id,
              google_sub: googleSub ?? "",
              account_email: user.email ?? undefined,
              access_token: null,
              refresh_token: null,
            },
            { onConflict: "google_sub,user_id" }
          );
          
          console.log("Stored basic Google account for:", user.email);
        }
      } catch (e) {
        console.error("Callback error:", e);
      }
      
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/`);
}
