import { childLogger } from "@/lib/logger";

const log = childLogger("notification/alerts");

interface BatchAlertPayload {
  event: "completed" | "failed";
  merchantIds?: string[];
  summary: Record<string, unknown>;
  error?: string;
}

function sendSlack(payload: BatchAlertPayload): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return Promise.resolve();
  const emoji = payload.event === "completed" ? "✅" : "🚨";
  const text = `${emoji} ReviveAI batch ${payload.event}\n\`\`\`${JSON.stringify(payload.summary, null, 2).slice(0, 1500)}\`\`\``;
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  })
    .then(() => undefined)
    .catch((err) => {
      log.warn({ err: String(err) }, "Slack alert failed");
    });
}

function sendEmail(payload: BatchAlertPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const to = process.env.ALERT_EMAIL;
  if (!apiKey || !from || !to) return Promise.resolve();

  const subject =
    payload.event === "completed"
      ? `✅ ReviveAI batch completed — ${JSON.stringify(payload.summary.processed ?? "?")} records`
      : `🚨 ReviveAI batch FAILED — ${payload.error ?? "unknown error"}`;

  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text: `ReviveAI batch ${payload.event}\n\n${JSON.stringify(payload.summary, null, 2)}`,
    }),
  })
    .then(() => undefined)
    .catch((err) => {
      log.warn({ err: String(err) }, "Email alert failed");
    });
}

function sendSentry(payload: BatchAlertPayload): Promise<void> {
  if (payload.event !== "failed") return Promise.resolve();
  return import("@sentry/nextjs")
    .then(({ captureException }) => {
      captureException(new Error(`Batch failed: ${payload.error ?? "unknown"}`), {
        extra: { summary: payload.summary },
      });
    })
    .catch(() => {});
}

export async function sendBatchAlert(payload: BatchAlertPayload): Promise<void> {
  await Promise.allSettled([sendSlack(payload), sendEmail(payload), sendSentry(payload)]);
  log.info({ event: payload.event, merchants: payload.merchantIds?.length ?? "all" }, "Batch alert sent");
}