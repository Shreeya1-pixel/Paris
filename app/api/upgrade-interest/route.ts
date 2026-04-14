import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 500 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.email) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const email = user.email.trim().toLowerCase();
  const payload = {
    user_id: user.id,
    email,
    source: "chatbot_limit",
  };

  let error: { message?: string } | null = null;
  try {
    const admin = createAdminClient();
    const res = await admin.from("upgrade_interest").upsert(payload, { onConflict: "email" });
    error = res.error;
  } catch {
    const res = await supabase.from("upgrade_interest").insert(payload);
    error = res.error;
  }

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[upgrade-interest] upsert failed:", error);
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
