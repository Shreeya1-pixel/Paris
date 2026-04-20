import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { GUEST_COOKIE_NAME } from "@/lib/auth/guest";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const oauthError = requestUrl.searchParams.get("error");
  const oauthDesc = requestUrl.searchParams.get("error_description");
  const origin = requestUrl.origin;

  if (oauthError) {
    const detail = encodeURIComponent(oauthDesc ?? oauthError);
    return NextResponse.redirect(`${origin}/auth/login?error=oauth&detail=${detail}`);
  }

  const code = requestUrl.searchParams.get("code");
  const onboarding = requestUrl.searchParams.get("onboarding");
  const next = onboarding ? "/onboarding" : "/map";

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=auth`);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.redirect(`${origin}/auth/login?error=config`);
  }

  const response = NextResponse.redirect(new URL(next, request.url));

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const detail = encodeURIComponent(error.message);
    return NextResponse.redirect(`${origin}/auth/login?error=exchange&detail=${detail}`);
  }

  response.cookies.delete(GUEST_COOKIE_NAME);
  return response;
}
