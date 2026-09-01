import { auth } from "@/auth";
import { PageHeader } from "@/components/ui";
import { Timeline } from "@/components/timeline";
import { getAuditRows, getConversationRows } from "@/lib/db/query";
import { safeJsonParse } from "@/lib/db/json";

export const dynamic = "force-dynamic";

export default async function TimelinePage() {
  const session = await auth();
  const merchantIds = session?.user?.merchantIds;
  const entries = await getAuditRows(merchantIds);
  const conversationRows = await getConversationRows(merchantIds);
  const conversationMap = Object.fromEntries(
    conversationRows.map((row) => [
      row.record_id,
      {
        turns: safeJsonParse<{ speaker: string; text: string }[]>(
          typeof row.turns === "string" ? row.turns : JSON.stringify(row.turns),
          [],
        ),
        intent: row.intent,
        resolution: row.resolution,
      },
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
