export interface EscalationTier {
  tier: 1 | 2 | 3 | 4 | 5 | 6;
  name: string;
  action: string;
  channels: string[];
}

export function escalationTier(
  hoursUntilDue: number,
  renewalCount: number,
): EscalationTier {
  if (renewalCount >= 2) {
    return {
      tier: 6,
      name: "Renewal limit reached",
      action: "No more renewals: manual handoff",
      channels: ["manual"],
    };
  }

  if (hoursUntilDue > 24) {
    return {
      tier: 1,
      name: "Pre-due",
      action: "Gentle reminder",
      channels: ["sms", "whatsapp"],
    };
  }
  if (hoursUntilDue > 0) {
    return {
      tier: 2,
      name: "Due today",
      action: "Day-of reminder",
      channels: ["sms", "whatsapp", "voice"],
    };
  }

  const daysMissed = Math.floor(-hoursUntilDue / 24);
  if (daysMissed <= 3) {
    return {
      tier: 3,
      name: `Missed ${daysMissed}d`,
      action: "Firm notice",
      channels: ["email", "sms"],
    };
  }
  if (daysMissed <= 7) {
    return {
      tier: 4,
      name: `Missed ${daysMissed}d`,
      action: "Payment plan offer",
      channels: ["email", "voice"],
    };
  }
  return {
    tier: 5,
    name: `Missed ${daysMissed}d`,
    action: "Legal / collections escalation",
    channels: ["manual"],
  };
}

export const G2_GRACE_DAYS = 3;
