const WEEKDAYS_EN = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];
const WEEKDAYS_HI: Record<string, number> = {
  somvar: 1, mangalvar: 2, budhvar: 3, guruvar: 4, shukravar: 5, shanivar: 6, ravivar: 0,
  "som war": 1, "mangal war": 2, "budh war": 3, "guru war": 4, "shukra war": 5, "shani war": 6,
};

export interface ParsedPromise {
  dueDate: string;
  amount?: number;
  confidence: number;
}

export interface ParseResult {
  parsed: ParsedPromise | null;
  reason: string;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setUTCHours(18, 0, 0, 0);
  return copy;
}

function nextWeekday(from: Date, weekday: number): Date {
  const result = new Date(startOfDay(from));
  let diff = (weekday - result.getUTCDay() + 7) % 7;
  if (diff === 0) diff = 7;
  result.setUTCDate(result.getUTCDate() + diff);
  return result;
}

export function parsePromiseText(
  text: string,
  referenceDate: Date = new Date(),
): ParseResult {
  const normalized = text.toLowerCase().trim();

  const amountMatch = normalized.match(/(?:₹|rs\.?|rupees?)\s*(\d[\d,]*(?:\.\d+)?)/);
  const bareAmountMatch = normalized.match(/\b(\d{2,7})\b/);

  let amount: number | undefined;
  if (amountMatch) {
    amount = Math.round(parseFloat(amountMatch[1].replace(/,/g, "")) * 100);
  } else if (bareAmountMatch) {
    amount = Math.round(parseFloat(bareAmountMatch[1]) * 100);
  }

  if (/(maybe|not sure|can't say|pata nahi|dekhenge|see later)/.test(normalized)) {
    return { parsed: null, reason: "Vague commitment, needs manual date input" };
  }

  if (/tomorrow|kal\b/.test(normalized)) {
    const d = startOfDay(referenceDate);
    d.setUTCDate(d.getUTCDate() + 1);
    return {
      parsed: { dueDate: d.toISOString(), amount, confidence: 0.9 },
      reason: "Parsed 'tomorrow'",
    };
  }

  if (/day after tomorrow|parso\d*n?\b/.test(normalized)) {
    const d = startOfDay(referenceDate);
    d.setUTCDate(d.getUTCDate() + 2);
    return {
      parsed: { dueDate: d.toISOString(), amount, confidence: 0.85 },
      reason: "Parsed 'day after tomorrow'",
    };
  }

  const inDays = normalized.match(/(\d+)\s*din\b|in\s+(\d+)\s*days?/);
  if (inDays) {
    const days = parseInt(inDays[1] ?? inDays[2], 10);
    const d = startOfDay(referenceDate);
    d.setUTCDate(d.getUTCDate() + days);
    return {
      parsed: { dueDate: d.toISOString(), amount, confidence: 0.85 },
      reason: `Parsed relative ${days}-day promise`,
    };
  }

  const inWeeks = normalized.match(/(\d+)\s*(?:hafte|haftha|weeks?)/);
  if (inWeeks) {
    const weeks = parseInt(inWeeks[1], 10);
    const d = startOfDay(referenceDate);
    d.setUTCDate(d.getUTCDate() + weeks * 7);
    return {
      parsed: { dueDate: d.toISOString(), amount, confidence: 0.8 },
      reason: `Parsed ${weeks}-week promise`,
    };
  }

  if (/next week/.test(normalized)) {
    const d = startOfDay(referenceDate);
    d.setUTCDate(d.getUTCDate() + 7);
    return {
      parsed: { dueDate: d.toISOString(), amount, confidence: 0.6 },
      reason: "Parsed vague 'next week' as +7 days",
    };
  }

  for (let i = 0; i < WEEKDAYS_EN.length; i++) {
    const dayName = WEEKDAYS_EN[i];
    if (new RegExp(`\\b${dayName}(?:day)?\\b`).test(normalized)) {
      const due = nextWeekday(referenceDate, i);
      return {
        parsed: { dueDate: due.toISOString(), amount, confidence: 0.9 },
        reason: `Parsed weekday '${dayName}'`,
      };
    }
  }

  for (const [word, weekday] of Object.entries(WEEKDAYS_HI)) {
    if (normalized.includes(word)) {
      const due = nextWeekday(referenceDate, weekday);
      return {
        parsed: { dueDate: due.toISOString(), amount, confidence: 0.85 },
        reason: `Parsed Hindi weekday '${word}'`,
      };
    }
  }

  const dateMatch = normalized.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (dateMatch && /(pay|kar|give|denge)/.test(normalized)) {
    const day = parseInt(dateMatch[1], 10);
    if (day >= 1 && day <= 31) {
      const d = startOfDay(referenceDate);
      d.setUTCDate(day);
      if (d.getTime() < startOfDay(referenceDate).getTime()) {
        d.setUTCMonth(d.getUTCMonth() + 1);
      }
      return {
        parsed: { dueDate: d.toISOString(), amount, confidence: 0.7 },
        reason: `Parsed explicit day-of-month ${day}`,
      };
    }
  }

  return { parsed: null, reason: "Unparseable promise text" };
}
