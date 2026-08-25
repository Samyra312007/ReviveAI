import { PageHeader } from "@/components/ui";
import { Timeline } from "@/components/timeline";
import { getAuditRows, getConversationRows } from "@/lib/db/query";

export const dynamic = "force-dynamic";

export default function TimelinePage() {
  const entries = getAuditRows();
  const conversationRows = getConversationRows();
  const conversationMap = Object.fromEntries(
    conversationRows.map((row) => [
      row.record_id,
      { turns: JSON.parse(row.turns), intent: row.intent, resolution: row.resolution },
    ]),
  );
  return (
    <>
      <PageHeader
        title="Decision Timeline"
        description="Every decision the agent made, in processing order. Click any entry for full reasoning, guardrail checks, API calls, and customer conversations."
      />
      <Timeline entries={entries} conversationMap={conversationMap} />
    </>
  );
}
