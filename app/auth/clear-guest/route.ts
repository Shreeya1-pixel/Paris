import { NextRequest, NextResponse } from "next/server";
import { GUEST_COOKIE_NAME } from "@/lib/auth/guest";

function safeNext(param: string | null): string {
  if (!param || !param.startsWith("/") || param.startsWith("//")) return "/map";
  return param;
}

/** After email/password sign-in or sign-up, clears guest cookie then redirects. */
export async function GET(request: NextRequest) {
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const res = NextResponse.redirect(new URL(next, request.url));
  res.cookies.delete(GUEST_COOKIE_NAME);
  return res;
}
