import Link from "next/link";
import { auth } from "@/auth";
import { getRecordsWithOutcomes } from "@/lib/db/query";
import { PageHeader, EmptyState, Table, OutcomeBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function RecordsPage() {
  const session = await auth();
  const merchantIds = session?.user?.merchantIds;
  const rows = await getRecordsWithOutcomes(merchantIds);

  return (
    <>
      <PageHeader
        title="Records"
        description="Every ingested failure with its latest decision. Click a record for the full drill-down."
      />
      {rows.length === 0 ? (
        <EmptyState message="No records yet. Connect a Razorpay account in onboarding, or run `npm run generate-data`." />
      ) : (
        <Table headers={["Record", "Customer", "Type", "Amount", "Outcome", ""]}>
          {rows.map((r) => (
            <tr key={r.record_id} className="text-zinc-300">
              <td className="px-4 py-2.5 font-mono text-xs">{r.record_id}</td>
              <td className="px-4 py-2.5">{r.customer_name}</td>
              <td className="px-4 py-2.5 capitalize">{r.type.replace(/_/g, " ")}</td>
              <td className="px-4 py-2.5 tabular-nums">₹{(r.amount / 100).toLocaleString("en-IN")}</td>
              <td className="px-4 py-2.5"><OutcomeBadge outcome={r.outcome} /></td>
              <td className="px-4 py-2.5 text-right">
                <Link href={`/records/${r.record_id}`} className="text-xs text-emerald-400 hover:underline">
                  View →
                </Link>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}