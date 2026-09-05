import { auth } from "@/auth";
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
  const session = await auth();
  const merchantIds = session?.user?.merchantIds;
  const entries = await getAuditRows(merchantIds);
  const dataBadge = merchantIds?.length
    ? { label: "Live Data", variant: "connected" as const }
    : { label: "Demo Data", variant: "demo" as const };
  return (
    <>
      <PageHeader
        title="Full Audit Log"
        description="Every decision, every guardrail check, every API call: searchable and exportable. This is the compliance trail."
        badge={dataBadge}
      />
      <AuditLog
        entries={entries}
        initialQuery={record_id ?? ""}
      />
    </>
  );
}
