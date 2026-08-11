import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE_NAME =
  process.env.NEXT_PUBLIC_SESSION_COOKIE_NAME ?? "ps_session";

const PUBLIC_PATHS = new Set(["/login"]);

/**
 * Soft gate based on cookie presence only.
 * Opaque session validity is enforced by the backend and by server layouts
 * that call GET /api/auth/me. Middleware does not bounce cookie holders off
 * /login (invalid cookies must not create redirect loops).
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  if (!hasSession) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    const returnTo = `${pathname}${request.nextUrl.search}`;
    if (
      returnTo.startsWith("/") &&
      !returnTo.startsWith("//") &&
      returnTo !== "/login"
    ) {
      loginUrl.searchParams.set("returnTo", returnTo);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
