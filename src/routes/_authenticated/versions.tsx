import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { policyVersionsQuery } from "@/lib/data";
import { Card, PageHeader, fmtTime } from "@/components/triage/ui";

export const Route = createFileRoute("/_authenticated/versions")({
  head: () => ({ meta: [{ title: "Versions — Triage" }, { name: "description", content: "Policy version history." }] }),
  component: Versions,
});

function Versions() {
  const { data = [] } = useQuery(policyVersionsQuery);
  return (
    <div>
      <PageHeader eyebrow="Policy owner" title="Versions" sub="New versions arrive as JSON of the same shape." />
      <Card className="p-0">
        <table className="w-full text-left text-[13px]">
          <thead><tr className="border-b border-line">{["Version", "Status", "Description", "Approved by", "Approved"].map((h) => <th key={h} className="label-mono px-6 py-3 font-normal">{h}</th>)}</tr></thead>
          <tbody>
            {data.map((v) => (
              <tr key={v.id} className="h-14 border-b border-line last:border-0">
                <td className="px-6 font-mono uppercase">{v.id}</td>
                <td className="px-6 capitalize">{v.status}</td>
                <td className="px-6 text-text-2">{v.description}</td>
                <td className="px-6">{v.approved_by}</td>
                <td className="px-6 font-mono text-[12px] text-text-2">{fmtTime(v.approved_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
