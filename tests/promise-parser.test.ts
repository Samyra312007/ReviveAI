import { describe, it, expect } from "vitest";
import { parsePromiseText } from "@/lib/promise/parser";

const REF = new Date("2026-08-25T12:00:00Z");

describe("promise parser", () => {
  it("parses English weekday", () => {
    const r = parsePromiseText("I will pay by Friday", REF);
    expect(r.parsed).not.toBeNull();
    expect(new Date(r.parsed!.dueDate).getUTCDay()).toBe(5);
    expect(r.parsed!.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("parses Hindi weekday (shukravar = Friday)", () => {
    const r = parsePromiseText("Shukravar tak payment kar dunga", REF);
    expect(r.parsed).not.toBeNull();
    expect(new Date(r.parsed!.dueDate).getUTCDay()).toBe(5);
  });

  it("parses tomorrow / kal", () => {
    const en = parsePromiseText("will pay tomorrow", REF);
    const hi = parsePromiseText("kal transfer karta hoon", REF);
    expect(en.parsed!.dueDate).toBe("2026-08-26T18:00:00.000Z");
    expect(hi.parsed!.dueDate).toBe("2026-08-26T18:00:00.000Z");
  });

  it("parses relative day counts in both languages", () => {
    const en = parsePromiseText("I'll pay in 3 days", REF);
    const hi = parsePromiseText("5 din mein denge", REF);
    expect(en.parsed!.dueDate).toContain("2026-08-28");
    expect(hi.parsed!.dueDate).toContain("2026-08-30");
  });

  it("extracts amounts with ₹ symbol and bare numbers", () => {
    const withSymbol = parsePromiseText("paying ₹15,000 by Friday", REF);
    expect(withSymbol.parsed!.amount).toBe(1500000);
    const bare = parsePromiseText("25000 will be paid monday", REF);
    expect(bare.parsed!.amount).toBe(2500000);
  });

  it("flags vague commitments as unparseable (edge case #10)", () => {
    const r = parsePromiseText("maybe next week, not sure", REF);
    expect(r.parsed).toBeNull();
    expect(r.reason).toContain("manual date input");
  });

  it("returns null for unparseable text", () => {
    const r = parsePromiseText("hello world", REF);
    expect(r.parsed).toBeNull();
    expect(r.reason).toContain("Unparseable");
  });

  it("never returns a due date in the past for weekdays", () => {
    const tuesday = new Date("2026-08-25T12:00:00Z"); // Tuesday
    const r = parsePromiseText("by Monday", tuesday);
    expect(new Date(r.parsed!.dueDate).getTime()).toBeGreaterThan(tuesday.getTime());
  });
});
