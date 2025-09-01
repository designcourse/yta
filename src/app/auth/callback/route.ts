import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { createSupabaseAdminClient } from "@/utils/supabase/admin";

async function checkUserHasChannels(userId: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data: channels } = await admin
    .from("channels")
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  return channels && channels.length > 0;
}

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
          const identityData = googleIdentity?.identity_data as any;
          const accountName = identityData?.name || (user.user_metadata as any)?.full_name;
          const givenName = identityData?.given_name || (user.user_metadata as any)?.name?.split?.(" ")?.[0];

          // Check if the user already has YouTube tokens
          const { data: existingAccount } = await admin
            .from("google_accounts")
            .select("access_token, refresh_token")
            .eq("user_id", user.id)
            .single();

          // Store/update the Google account, preserving existing YouTube tokens if they exist
          const basePayload: any = {
            user_id: user.id,
            google_sub: googleSub ?? "",
            account_email: user.email ?? undefined,
            // Preserve existing tokens if they exist, otherwise set to null
            access_token: existingAccount?.access_token || null,
            refresh_token: existingAccount?.refresh_token || null,
          };

          if (accountName) basePayload.account_name = accountName;
          if (givenName) basePayload.given_name = givenName;

          let { error: upsertError } = await admin
            .from("google_accounts")
            .upsert(basePayload, { onConflict: "google_sub,user_id" });

          if (upsertError && (upsertError.message?.includes("account_name") || upsertError.message?.includes("given_name"))) {
            // Retry without name fields if columns don't exist yet
            delete basePayload.account_name;
            delete basePayload.given_name;
            const retry = await admin
              .from("google_accounts")
              .upsert(basePayload, { onConflict: "google_sub,user_id" });
            upsertError = retry.error;
          }

          // Assign role: admin for designcoursecom@gmail.com else default user
          try {
            const { data: roles } = await admin.from('user_roles').select('id,name');
            const adminRoleId = roles?.find(r => r.name === 'admin')?.id;
            const userRoleId = roles?.find(r => r.name === 'user')?.id;
            const targetRole = user.email === 'designcoursecom@gmail.com' ? adminRoleId : userRoleId;
            if (targetRole) {
              await admin
                .from('google_accounts')
                .update({ role_id: targetRole })
                .eq('user_id', user.id);
            }
          } catch {}

          console.log("Stored basic Google account for:", user.email);

          // Check if user has channels and redirect accordingly
          const hasChannels = await checkUserHasChannels(user.id);
          if (!hasChannels) {
            next = "/onboard";
          }
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
