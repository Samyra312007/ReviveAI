import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    // Keep tests hermetic: Vite auto-loads .env.local, which would otherwise
    // leak real credentials (Neon, Resend, Slack, WhatsApp, Sentry) into the
    // test process — redirecting queries to Postgres and firing real outbound
    // alerts that hang on blocked networks. Blank them so tests always use
    // the local SQLite fixture and simulated providers.
    env: {
      DATABASE_URL: "",
      SLACK_WEBHOOK_URL: "",
      RESEND_API_KEY: "",
      RESEND_FROM_EMAIL: "",
      ALERT_EMAIL: "",
      WHATSAPP_ACCESS_TOKEN: "",
      WHATSAPP_PHONE_NUMBER_ID: "",
      NEXT_PUBLIC_SENTRY_DSN: "",
      // Real Razorpay keys would make the batch executor fire live API calls
      // (5s timeout + retry per record) — blank them so execution simulates.
      RAZORPAY_KEY_ID: "",
      RAZORPAY_KEY_SECRET: "",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
