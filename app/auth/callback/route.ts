import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  const oauthError = searchParams.get("error");
  const oauthDesc = searchParams.get("error_description");
  if (oauthError) {
    const detail = encodeURIComponent(oauthDesc ?? oauthError);
    return NextResponse.redirect(`${origin}/auth/login?error=oauth&detail=${detail}`);
  }

  const code = searchParams.get("code");
  const onboarding = searchParams.get("onboarding");
  const next = onboarding ? "/onboarding" : "/map";

  if (code) {
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.redirect(`${origin}/auth/login?error=config`);
    }
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    const detail = encodeURIComponent(error.message);
    return NextResponse.redirect(`${origin}/auth/login?error=exchange&detail=${detail}`);
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth`);
}
