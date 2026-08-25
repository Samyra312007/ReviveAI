import { describe, it, expect } from "vitest";
import { escalationTier } from "@/lib/promise/escalation";

describe("promise escalation tiers", () => {
  it("tier 1 — pre-due gentle reminder (>24h until due)", () => {
    const t = escalationTier(48, 0);
    expect(t.tier).toBe(1);
    expect(t.action).toContain("Gentle");
  });

  it("tier 2 — day-of reminder with voice channel", () => {
    const t = escalationTier(6, 0);
    expect(t.tier).toBe(2);
    expect(t.channels).toContain("voice");
  });

  it("tier 3 — firm notice within 3 days missed", () => {
    const t = escalationTier(-48, 0);
    expect(t.tier).toBe(3);
    expect(t.action).toContain("Firm");
  });

  it("tier 4 — payment plan offer at 4-7 days missed", () => {
    const t = escalationTier(-120, 0);
    expect(t.tier).toBe(4);
    expect(t.action).toContain("Payment plan");
  });

  it("tier 5 — legal escalation beyond 7 days missed", () => {
    const t = escalationTier(-240, 0);
    expect(t.tier).toBe(5);
    expect(t.action).toContain("Legal");
  });

  it("tier 6 — renewal limit overrides everything", () => {
    const t = escalationTier(-240, 2);
    expect(t.tier).toBe(6);
    expect(t.action).toContain("manual handoff");

    const preDueWithRenewals = escalationTier(48, 2);
    expect(preDueWithRenewals.tier).toBe(6);
  });
});
