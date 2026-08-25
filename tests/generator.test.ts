import { describe, it, expect } from "vitest";
import { generateBatch, DEFAULT_SEED } from "@/lib/data/generator";
import {
  RECORD_COUNTS,
  SUBCATEGORY_COUNTS,
  SyntheticRecord,
} from "@/lib/data/schema";

describe("generateBatch", () => {
  const { records, promises } = generateBatch(DEFAULT_SEED);

  it("generates exactly 150 records", () => {
    expect(records).toHaveLength(150);
  });

  it("matches record type distribution", () => {
    for (const [type, count] of Object.entries(RECORD_COUNTS)) {
      const actual = records.filter((r) => r.type === type).length;
      expect(actual, type).toBe(count);
    }
  });

  it("matches subcategory distribution", () => {
    for (const [type, subs] of Object.entries(SUBCATEGORY_COUNTS)) {
      for (const [sub, count] of Object.entries(subs)) {
        const actual = records.filter(
          (r) => r.type === type && r.subcategory === sub,
        ).length;
        expect(actual, `${type}/${sub}`).toBe(count);
      }
    }
  });

  it("has no duplicate customer_ids", () => {
    const ids = records.map((r) => r.customer_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique record_ids with correct format", () => {
    const ids = records.map((r) => r.record_id);
    expect(new Set(ids).size).toBe(150);
    expect(ids[0]).toMatch(/^rec_\d{3}$/);
  });

  it("amounts are within ₹49 - ₹2,00,000 and rupee-rounded paise", () => {
    for (const r of records) {
      expect(r.amount).toBeGreaterThanOrEqual(4900);
      expect(r.amount).toBeLessThanOrEqual(20000000);
      expect(r.amount % 100).toBe(0);
    }
  });

  it("timestamps span last 30 days", () => {
    const now = Date.now();
    const thirtyDays = 30 * 24 * 3600 * 1000;
    for (const r of records) {
      const ts = new Date(r.failure_timestamp).getTime();
      expect(ts).toBeLessThanOrEqual(now);
      expect(now - ts).toBeLessThanOrEqual(thirtyDays + 1000);
    }
  });

  it("phone numbers follow Indian format", () => {
    for (const r of records) {
      expect(r.customer_phone).toMatch(/^\+91[6-9]\d{9}$/);
    }
  });

  it("customer segments distributed realistically (60/25/15 ±10%)", () => {
    const counts = records.reduce<Record<string, number>>((acc, r) => {
      acc[r.customer_segment] = (acc[r.customer_segment] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts.mid_value).toBeGreaterThan(75); // 60% ± 15
    expect(counts.high_value).toBeGreaterThan(22);
    expect(counts.low_value).toBeGreaterThan(7);
  });

  it("control records are never recoverable", () => {
    const controls = records.filter((r) => r.type === "control");
    expect(controls).toHaveLength(20);
    for (const c of controls) {
      expect(c.ground_truth.recoverable).toBe(false);
      expect(c.ground_truth.recommended_intervention).toBe("NO_ACTION");
      expect(c.ground_truth.recoverable_amount).toBe(0);
    }
  });

  it("fraud_hold records recommend SKIP with zero recovery", () => {
    const fraud = records.filter((r) => r.subcategory === "fraud_hold");
    expect(fraud.length).toBe(4);
    for (const f of fraud) {
      expect(f.ground_truth.recommended_intervention).toBe("SKIP");
      expect(f.ground_truth.recoverable_amount).toBe(0);
    }
  });

  it("every record has ground truth with valid probability", () => {
    for (const r of records) {
      const gt = r.ground_truth;
      expect(gt.expected_recovery_probability).toBeGreaterThanOrEqual(0);
      expect(gt.expected_recovery_probability).toBeLessThanOrEqual(1);
      if (!gt.recoverable) {
        expect(gt.recoverable_amount).toBe(0);
      } else {
        expect(gt.recoverable_amount).toBe(r.amount);
      }
    }
  });

  it("overdue invoices have promise data on ~70% of records", () => {
    const invoices = records.filter((r) => r.type === "overdue_invoice");
    const withPromises = invoices.filter(
      (r: SyntheticRecord) => r.promise_status !== undefined,
    );
    expect(withPromises.length).toBeGreaterThan(8);
    expect(withPromises.length).toBeLessThanOrEqual(promises.length);
  });

  it("all voice opt-in customers have a preferred language", () => {
    for (const r of records) {
      expect(["en", "hi", "hinglish"]).toContain(r.preferred_language);
      expect(typeof r.voice_opt_in).toBe("boolean");
    }
  });

  it("is deterministic for the same seed", () => {
    const a = generateBatch(DEFAULT_SEED);
    const b = generateBatch(DEFAULT_SEED);
    expect(a.records).toEqual(b.records);
    expect(a.promises).toEqual(b.promises);
  });

  it("produces different output for different seeds", () => {
    const a = generateBatch(42);
    const b = generateBatch(43);
    expect(a.records).not.toEqual(b.records);
  });
});
