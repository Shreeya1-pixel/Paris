import { NextRequest, NextResponse } from "next/server";
import { GUEST_COOKIE_NAME, guestCookieOptions } from "@/lib/auth/guest";

export async function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/map", request.url));
  res.cookies.set(GUEST_COOKIE_NAME, "1", guestCookieOptions());
  return res;
}
