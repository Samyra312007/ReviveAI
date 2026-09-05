import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge-safe auth guard.
 *
 * Previously this re-exported `auth` from `@/auth`, which dragged the
 * Postgres adapter (`pg` + `@auth/pg-adapter`) into the edge bundle. `pg`
 * requires the Node-only `node:util/types` module at import time, which
 * crashes the edge runtime with "Native module not found" the first time a
 * protected route is hit.
 *
 * Instead, we read the session JWT directly with `getToken`: pure JWT
 * decoding, no database, fully edge-compatible. Page requests without a
 * session are redirected to /login; API routes pass through because they
 * already self-guard with `auth()` and return 401.
 */
export async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });

  if (!token) {
    // API routes handle their own authorization (401), never redirect them.
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.next();
    }

    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Protect dashboard pages and all API routes that require auth.
     * Landing page (/) and login/register pages stay public.
     */
    "/dashboard/:path*",
    "/results/:path*",
    "/timeline/:path*",
    "/council/:path*",
    "/simulator/:path*",
    "/guardrails/:path*",
    "/exceptions/:path*",
    "/audit/:path*",
    "/voice/:path*",
    "/promises/:path*",
    "/fleet/:path*",
    "/onboarding/:path*",
    "/settings/:path*",
    "/records/:path*",
    "/api/batch/:path*",
    "/api/simulate/:path*",
    "/api/council/:path*",
    "/api/records/:path*",
    "/api/audit/:path*",
    "/api/report/:path*",
    "/api/promises/:path*",
    "/api/voice/:path*",
    "/api/conversations/:path*",
    "/api/merchants/:path*",
  ],
};