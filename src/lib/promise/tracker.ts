import { PromiseRecord, ReminderRecord, SyntheticRecord } from "@/lib/data/schema";
import { escalationTier, G2_GRACE_DAYS } from "./escalation";
import { parsePromiseText } from "./parser";

export interface PromiseEvent {
  promise_id: string;
  record_id: string;
  event: string;
  detail: string;
  tier?: number;
}

export interface PromiseProcessingResult {
  updatedPromises: PromiseRecord[];
  events: PromiseEvent[];
  remindersCreated: number;
  promisesBroken: number;
  promisesEscalated: number;
  offersMade: number;
}

const MAX_RENEWALS = 2;

function makeReminder(
  num: number,
  type: ReminderRecord["reminder_type"],
  channel: ReminderRecord["channel"],
  sentAtMs: number,
  message: string,
): ReminderRecord {
  return {
    reminder_id: `rem_${num}_${type}`,
    reminder_type: type,
    channel,
    sent_at: new Date(sentAtMs).toISOString(),
    message,
  };
}

export function processPromises(
  records: SyntheticRecord[],
  nowMs: number,
  rng: () => number = Math.random,
): PromiseProcessingResult {
  const events: PromiseEvent[] = [];
  const updatedPromises: PromiseRecord[] = [];
  let remindersCreated = 0;
  let promisesBroken = 0;
  let promisesEscalated = 0;
  const offersMade = 0;
  let remNum = 0;

  for (const record of records) {
    if (record.type !== "overdue_invoice") continue;
    const promise = record.promise_history?.[0];
    if (!promise) continue;

    const dueMs = new Date(promise.due_date).getTime();
    const hoursUntilDue = (dueMs - nowMs) / 3600000;
    const tier = escalationTier(hoursUntilDue, promise.renewal_count);

    if (promise.status === "fulfilled") {
      events.push({
        promise_id: promise.promise_id,
        record_id: record.record_id,
        event: "FULFILLED",
        detail: `Paid ${promise.fulfilled_amount! / 100} on time`,
      });
      continue;
    }

    if (
      (promise.status === "pending" || promise.status === "renewed") &&
      hoursUntilDue < -G2_GRACE_DAYS * 24
    ) {
      promise.status = "broken";
      promisesBroken++;
      events.push({
        promise_id: promise.promise_id,
        record_id: record.record_id,
        event: "MARK_BROKEN",
        detail: `Auto-marked broken: due date passed by more than ${G2_GRACE_DAYS} days (rule G2)`,
        tier: tier.tier,
      });

      if (tier.tier === 6 || promise.renewal_count >= MAX_RENEWALS) {
        promise.status = "escalated";
        promisesEscalated++;
        events.push({
          promise_id: promise.promise_id,
          record_id: record.record_id,
          event: "ESCALATED",
          detail: `Renewal limit (${promise.renewal_count}) reached — manual handoff`,
          tier: 6,
        });
      } else {
        events.push({
          promise_id: promise.promise_id,
          record_id: record.record_id,
          event: "ESCALATION",
          detail: `${tier.action} via ${tier.channels.join(" + ")}`,
          tier: tier.tier,
        });
      }
      updatedPromises.push(promise);
      continue;
    }

    if (promise.status === "broken" || promise.status === "escalated") {
      events.push({
        promise_id: promise.promise_id,
        record_id: record.record_id,
        event: "ALREADY_BROKEN",
        detail:
          promise.renewal_count >= MAX_RENEWALS
            ? `Renewals exhausted (${promise.renewal_count}) — no further automated follow-up`
            : `Awaiting ${tier.action.toLowerCase()}`,
        tier: tier.tier,
      });
      continue;
    }

    if (
      promise.status === "pending" &&
      hoursUntilDue <= 24 &&
      hoursUntilDue > -24
    ) {
      const type: ReminderRecord["reminder_type"] =
        hoursUntilDue > 0 ? (hoursUntilDue <= 12 ? "on_due" : "pre_due") : "post_due";
      promise.reminders_sent = promise.reminders_sent ?? [];
      promise.reminders_sent.push(
        makeReminder(
          ++remNum,
          type,
          tier.tier >= 2 ? "whatsapp" : "sms",
          nowMs,
          type === "pre_due"
            ? "Aapka payment kal due hai — yaad dila rahe hain."
            : type === "on_due"
              ? "Aaj aapka payment ka din hai."
              : "Payment abhi tak nahi aaya — kripya jald complete karein.",
        ),
      );
      remindersCreated++;
      events.push({
        promise_id: promise.promise_id,
        record_id: record.record_id,
        event: "REMINDER_SENT",
        detail: `${type} reminder via whatsapp/sms`,
        tier: tier.tier,
      });
      updatedPromises.push(promise);
      continue;
    }

    if (
      promise.status === "pending" &&
      rng() < 0.3 &&
      promise.renewal_count < MAX_RENEWALS
    ) {
      const responses = [
        "Friday tak kar dunga",
        "I will pay by Monday, ₹25000",
        "Next week pakka denge",
        "Kal transfer karunga",
        "Maybe next month, not sure",
      ];
      const responseText = responses[Math.floor(rng() * responses.length)];
      const parsed = parsePromiseText(responseText, new Date(nowMs));
      events.push({
        promise_id: promise.promise_id,
        record_id: record.record_id,
        event: parsed.parsed ? "RENEWAL_REQUESTED" : "PARSE_FAILED",
        detail: parsed.parsed
          ? `Customer said '${responseText}' → due ${new Date(parsed.parsed.dueDate).toISOString().slice(0, 10)}`
          : `Customer said '${responseText}' → ${parsed.reason}`,
      });
      if (parsed.parsed) {
        promise.renewal_count += 1;
        promise.due_date = parsed.parsed.dueDate;
        promise.status =
          promise.renewal_count >= MAX_RENEWALS ? "escalated" : "renewed";
        if (promise.status === "escalated") promisesEscalated++;
        events.push({
          promise_id: promise.promise_id,
          record_id: record.record_id,
          event: promise.status === "escalated" ? "ESCALATED" : "RENEWED",
          detail: `Renewal #${promise.renewal_count} accepted${promise.status === "escalated" ? " then capped — escalated (rule G1)" : ""}`,
        });
        updatedPromises.push(promise);
      }
      continue;
    }
  }

  return {
    updatedPromises,
    events,
    remindersCreated,
    promisesBroken,
    promisesEscalated,
    offersMade,
  };
}
