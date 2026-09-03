export { auth as middleware } from "@/auth";

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
