import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { policyVersionsQuery } from "@/lib/data";
import { diffPolicies } from "@/lib/policy-text";
import type { Policy } from "@/lib/triage";
import { Card, PageHeader, fmtTime } from "@/components/triage/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/versions")({
  head: () => ({
    meta: [
      { title: "Versions — Triage" },
      { name: "description", content: "Policy version history." },
    ],
  }),
  component: Versions,
});

function Versions() {
  const { data = [] } = useQuery(policyVersionsQuery);
  return (
    <div>
      <PageHeader
        eyebrow="Policy owner"
        title="Versions"
        sub="Every policy version, oldest first. New versions are created on the Policy page as drafts and checked on Change impact."
      />
      <Card className="p-0">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-line">
              {["Version", "Status", "What changed", "Created", "Approved", ""].map((h) => (
                <th key={h} className="label-mono px-6 py-3 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((v, i) => {
              const prev = i > 0 ? (data[i - 1].config as unknown as Policy) : null;
              const changes = prev ? diffPolicies(prev, v.config as unknown as Policy) : [];
              return (
                <tr key={v.id} className="border-b border-line align-top last:border-0">
                  <td className="px-6 py-4 font-mono uppercase">{v.id}</td>
                  <td className="px-6 py-4">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[12px] capitalize",
                        v.status === "active"
                          ? "bg-foreground text-background"
                          : "bg-surface-2 text-text-2 ring-1 ring-line",
                      )}
                    >
                      {v.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {v.description && <p className="mb-1">{v.description}</p>}
                    {prev ? (
                      changes.length ? (
                        <ul className="space-y-0.5 text-text-2">
                          {changes.map((c) => (
                            <li key={c}>• {c}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-text-3">Same rules as {data[i - 1].id}</p>
                      )
                    ) : (
                      <p className="text-text-3">Initial version</p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-text-2">
                    {v.created_by && <p>{v.created_by}</p>}
                    <p className="font-mono text-[12px]">{fmtTime(v.created_at)}</p>
                  </td>
                  <td className="px-6 py-4 text-text-2">
                    {v.approved_by ? (
                      <>
                        <p>{v.approved_by}</p>
                        <p className="font-mono text-[12px]">{fmtTime(v.approved_at)}</p>
                      </>
                    ) : (
                      <p className="text-text-3">Not yet</p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {v.status !== "active" && (
                      <Link
                        to="/impact"
                        search={{ v: v.id }}
                        className="whitespace-nowrap text-link hover:underline"
                      >
                        See impact →
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
