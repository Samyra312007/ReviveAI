import { describe, it, expect } from "vitest";
import { executeBatchRun, DEMO_BATCH_TOKEN } from "@/lib/batch/service";
import { parsePromiseText } from "@/lib/promise/parser";
import { buildCsv, csvCell } from "@/lib/csv";

describe("SECURITY REGRESSION — post-remediation guarantees", () => {
  it(
    "VULN-001 fixed: batch execution requires a valid x-batch-token",
    async () => {
      const noToken = await executeBatchRun(null);
      expect(noToken.status).toBe(401);

      const badToken = await executeBatchRun("attacker-token");
      expect(badToken.status).toBe(401);
    },
  );

  it(
    "VULN-004 fixed: concurrent batch runs are rejected with 409 instead of racing",
    async () => {
      const first = executeBatchRun(DEMO_BATCH_TOKEN);
      const second = executeBatchRun(DEMO_BATCH_TOKEN);
      const results = await Promise.all([first, second]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([200, 409]);

      const third = await executeBatchRun(DEMO_BATCH_TOKEN);
      expect(third.status).toBe(200);
    },
  );

  it(
    "VULN-002/003 fixed: server-authoritative seed and time — attacker cannot influence report",
    async () => {
      const first = await executeBatchRun(DEMO_BATCH_TOKEN);
      expect(first.status).toBe(200);
      const rateA = (first.body.report as { hero: { recovery_rate_pct: number } })
        .hero.recovery_rate_pct;

      const second = await executeBatchRun(DEMO_BATCH_TOKEN);
      const rateB = (second.body.report as { hero: { recovery_rate_pct: number } })
        .hero.recovery_rate_pct;

      expect(rateA).toBe(rateB);
    },
  );

  it("VULN-005 fixed: CSV cells starting with formula characters are escaped", () => {
    expect(csvCell('=HYPERLINK("http://evil.example","Click")')).toBe(
      `"'=HYPERLINK(""http://evil.example"",""Click"")"`,
    );
    expect(csvCell("+SUM(A1:A2)")).toBe("'\\+SUM(A1:A2)".replace("\\+", "+"));
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("-5")).toBe("'-5");

    const csv = buildCsv(["record_id", "reasoning"], [
      ["rec_001", '=HYPERLINK("http://evil.example","Click")'],
      ["rec_004", "normal text"],
      ["rec_005", "has, comma"],
      ["rec_006", 'has "quotes"'],
    ]);
    const lines = csv.split("\n");
    expect(lines[1].startsWith('rec_001,"\'=')).toBe(true);
    expect(lines[2]).toBe("rec_004,normal text");
    expect(lines[3]).toBe('rec_005,"has, comma"');
    expect(lines[4]).toBe('rec_006,"has ""quotes"""');
  });

  it("RELB-001 fixed: malformed report.json returns null instead of crashing pages", async () => {
    const { writeFileSync } = await import("node:fs");
    const { getReportJson } = await import("@/lib/db/query");
    const tmp = "/tmp/opencode/bad-report.json";
    writeFileSync(tmp, "{ not valid json !!!");
    expect(getReportJson(tmp)).toBeNull();
    expect(getReportJson("/tmp/opencode/does-not-exist.json")).toBeNull();
  });

  it("VULN-009 CHECKED: no ReDoS; day>31 correctly rejected", () => {
    const r1 = parsePromiseText("pay by 99", new Date("2026-08-25"));
    expect(r1.parsed).toBeNull();

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      parsePromiseText("x".repeat(500) + " friday", new Date("2026-08-25"));
    }
    const elapsed = performance.now() - start;
    console.log(`1000 parses of 505-char string: ${elapsed.toFixed(0)}ms`);
    expect(elapsed).toBeLessThan(2000);
  });
});
