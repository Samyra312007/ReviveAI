import { PageHeader } from "@/components/ui";
import { WhatIfConsole } from "@/components/what-if-console";

export const dynamic = "force-dynamic";

export default async function SimulatorPage() {
  return (
    <>
      <PageHeader
        title="What-If Economics Console"
        description="Move the guardrails, watch the money. Every simulation runs the complete detect → diagnose → guardrail → execute pipeline against all 150 records: in-memory, deterministic, and side-effect free."
      />
      <WhatIfConsole />
    </>
  );
}
