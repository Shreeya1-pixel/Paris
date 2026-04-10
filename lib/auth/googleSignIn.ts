import type { SupabaseClient } from "@supabase/supabase-js";

export function isSupabaseConfigured(): boolean {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  return (
    Boolean(url && key) &&
    !url.includes("placeholder.supabase.co") &&
    key !== "placeholder-anon-key"
  );
}

/**
 * Google OAuth via Supabase PKCE flow.
 * Returns an error message if setup fails; on success the browser navigates away.
 */
export async function signInWithGoogle(
  supabase: SupabaseClient,
  options?: { onboarding?: boolean }
): Promise<{ error: string | null }> {
  if (typeof window === "undefined") {
    return { error: "Sign-in must run in the browser." };
  }
  if (!isSupabaseConfigured()) {
    return {
      error:
        "Supabase env vars are missing or still set to placeholders. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local, then restart the dev server.",
    };
  }

  const redirect = new URL("/auth/callback", window.location.origin);
  if (options?.onboarding) redirect.searchParams.set("onboarding", "1");

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirect.toString(),
      },
    });

    if (error) return { error: error.message };

    if (data?.url) {
      window.location.assign(data.url);
      return { error: null };
    }

    return {
      error:
        "No redirect URL returned from Supabase. Check Authentication → URL configuration and add this exact redirect: " +
        redirect.toString(),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Google sign-in failed";
    return { error: message };
  }
}
