import { PageHeader } from "@/components/ui";
import { AuditLog } from "@/components/audit-log";
import { getAuditRows } from "@/lib/db/query";

export const dynamic = "force-dynamic";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ record_id?: string }>;
}) {
  const { record_id } = await searchParams;
  const entries = getAuditRows();
  return (
    <>
      <PageHeader
        title="Full Audit Log"
        description="Every decision, every guardrail check, every API call — searchable and exportable. This is the compliance trail."
      />
      <AuditLog
        entries={entries}
        initialQuery={record_id ?? ""}
      />
    </>
  );
}
