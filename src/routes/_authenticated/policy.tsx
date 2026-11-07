import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { activePolicyQuery } from "@/lib/data";
import { Card, Mono, PageHeader, fmtEur } from "@/components/triage/ui";

export const Route = createFileRoute("/_authenticated/policy")({
  head: () => ({ meta: [{ title: "Policy — Triage" }, { name: "description", content: "The active triage policy." }] }),
  component: PolicyPage,
});

function PolicyPage() {
  const { data: p } = useQuery(activePolicyQuery);
  if (!p) return <p className="label-mono">Loading</p>;
  const hr = p.human_review;
  const rows: [string, string][] = [
    ["Policy must be active", hr.require_policy_active ? "Yes" : "No"],
    ["Allowed claim types", hr.allowed_claim_types.join(", ")],
    ["Flags that need a person", hr.flag_fields.join(", ")],
    ["Quote limit", hr.quote_limit_eur === null ? "None" : `${fmtEur(hr.quote_limit_eur)} (strictly above → review)`],
    ["Review repair types", hr.review_repair_types.length ? hr.review_repair_types.join(", ") : "None"],
    ["Required documents", p.required_documents.join(", ")],
  ];
  return (
    <div>
      <PageHeader eyebrow={`Policy ${p.version} · active`} title="Policy" sub={p.description} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="section-title mb-4">Rules, in order</h2>
          <ol className="space-y-3 text-[13px]">
            <li><Mono className="mr-2">R1</Mono>Human review if any known trigger fires.</li>
            <li><Mono className="mr-2">BLANK</Mono>Request info if a field the policy uses is unknown.</li>
            <li><Mono className="mr-2">R2</Mono>Request info if a required document is missing.</li>
            <li><Mono className="mr-2">R3</Mono>Routine processing otherwise.</li>
          </ol>
          <dl className="mt-6 divide-y divide-line border-t border-line text-[13px]">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-2.5">
                <dt className="text-text-2">{k}</dt>
                <dd className="text-right font-mono text-[12px]">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card>
          <h2 className="section-title mb-4">Policy JSON</h2>
          <pre className="overflow-auto rounded-md bg-surface-2 p-4 font-mono text-[12px] leading-relaxed">{JSON.stringify(p, null, 2)}</pre>
        </Card>
      </div>
    </div>
  );
}
