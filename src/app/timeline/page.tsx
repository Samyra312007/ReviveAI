import { PageHeader } from "@/components/ui";
import { Timeline } from "@/components/timeline";
import { getAuditRows } from "@/lib/db/query";

export const dynamic = "force-dynamic";

export default function TimelinePage() {
  const entries = getAuditRows();
  return (
    <>
      <PageHeader
        title="Decision Timeline"
        description="Every decision the agent made, in processing order. Click any entry for full reasoning, guardrail checks, and API calls."
      />
      <Timeline entries={entries} />
    </>
  );
}
