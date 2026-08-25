export interface GuardrailConfig {
  maxRetriesPerRecord: number;
  maxRetriesPerCustomerDay: number;
  maxInterventionRatioPct: number;
  quietStartHourIst: number;
  quietEndHourIst: number;
  cooldownHours: number;
  checkoutNudgeWindowHours: number;
  subscriptionRetryWindowDays: number;
  maxSmsPerDay: number;
  approvalThresholdPaise: number;
  dailyVolumeCapPaise: number;
  roiCostRatioPct: number;
  maxVoicePerWeek: number;
}

export const DEFAULT_GUARDRAIL_CONFIG: GuardrailConfig = {
  maxRetriesPerRecord: 2,
  maxRetriesPerCustomerDay: 3,
  maxInterventionRatioPct: 80,
  quietStartHourIst: 21,
  quietEndHourIst: 8,
  cooldownHours: 4,
  checkoutNudgeWindowHours: 2,
  subscriptionRetryWindowDays: 7,
  maxSmsPerDay: 1,
  approvalThresholdPaise: 50000 * 100,
  dailyVolumeCapPaise: 500000 * 100,
  roiCostRatioPct: 30,
  maxVoicePerWeek: 1,
};

export function resolveGuardrailConfig(
  overrides?: Partial<GuardrailConfig>,
): GuardrailConfig {
  return { ...DEFAULT_GUARDRAIL_CONFIG, ...overrides };
}
