import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { activePolicyQuery, casesQuery } from "@/lib/data";
import { decide, RECOMMENDATION_LABELS, type Recommendation } from "@/lib/triage";
import { Card, PageHeader, StatusDot } from "@/components/triage/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/tests")({
  head: () => ({ meta: [{ title: "Test results — Triage" }, { name: "description", content: "Engine self-test against labelled cases." }] }),
  component: Tests,
});

function Tests() {
  const { data: cases = [] } = useQuery(casesQuery);
  const { data: policy } = useQuery(activePolicyQuery);
  const labelled = cases.filter((c) => c.claim.raw && (c.claim.raw as Record<string, string>)[`expected_${policy?.version ?? "v1"}`]);
  const results = policy
    ? labelled.map((c) => {
        const expected = (c.claim.raw as Record<string, string>)[`expected_${policy.version}`] as Recommendation;
        const d = decide(c.claim, policy);
        return { id: c.claim.case_id, expected, got: d.recommendation, rule: d.rule_id, ok: expected === d.recommendation };
      })
    : [];
  const pass = results.filter((r) => r.ok).length;
  const allOk = results.length > 0 && pass === results.length;

  return (
    <div>
      <PageHeader eyebrow="Policy owner" title="Test results" />
      <div className={cn("card-quiet mb-6 flex items-center justify-between p-5", !allOk && results.length && "tint-action")}>
        <span className="label-mono">Engine self-test · policy {policy?.version}</span>
        <span className="num font-mono text-[15px]">{pass}/{results.length} dev cases match</span>
      </div>
      <Card className="p-0">
        <table className="w-full text-left text-[13px]">
          <thead><tr className="border-b border-line">{["Case", "Expected", "Engine", "Rule", ""].map((h) => <th key={h} className="label-mono px-6 py-3 font-normal">{h}</th>)}</tr></thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.id} className="h-12 border-b border-line last:border-0">
                <td className="px-6 font-mono text-[12px]">{r.id}</td>
                <td className="px-6 text-text-2">{RECOMMENDATION_LABELS[r.expected]}</td>
                <td className="px-6"><StatusDot rec={r.got} /></td>
                <td className="px-6 font-mono text-[11px] uppercase text-text-2">{r.rule}</td>
                <td className={cn("px-6 font-mono text-[11px] uppercase", r.ok ? "text-text-3" : "text-action")}>{r.ok ? "match" : "mismatch"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
