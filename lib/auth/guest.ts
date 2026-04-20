/** Cookie set when browsing signed out; combined with (app) layout to allow map/discover without Supabase session. */

export const GUEST_COOKIE_NAME = "ow_guest";

export function guestCookieOptions(): {
  path: string;
  maxAge: number;
  sameSite: "lax";
  secure: boolean;
  httpOnly: boolean;
} {
  return {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
  };
}
