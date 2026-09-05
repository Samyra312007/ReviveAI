// This file configures the initialization of Sentry on the client.
// It is the only client-side Sentry entrypoint (supersedes sentry.client.config.ts,
// which is deprecated and unsupported under Turbopack).
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled:
    process.env.NODE_ENV === "production" && !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Add optional integrations for additional features
  integrations: [Sentry.replayIntegration()],

  // Trace 10% of transactions, matching the server/edge sample rate.
  // Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 0.1,

  // Session replay only captures on error, never on normal sessions.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
});

// Instruments client-side navigations so each route change is traced.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;