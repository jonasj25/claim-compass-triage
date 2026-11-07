import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { activePolicyQuery } from "@/lib/data";
import { parseClaimsCsv, type ParsedClaim } from "@/lib/csv";
import { importClaims, type ImportResult } from "@/lib/import";
import { decide } from "@/lib/triage";
import { useRole } from "@/lib/role";
import { QUEUE_LABELS, queueFor, type Queue } from "@/lib/lifecycle";
import { isClosed } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/triage/ui";
import { ImportResultDialog } from "@/components/triage/ImportResultDialog";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({ meta: [
{ property: "og:title", content: "Import CSV — Clearpath" },
{ property: "og:description", content: "Clearpath claims workspace: review evidence, policy decisions and case activity." },
{ property: "og:type", content: "website" },
{ name: "twitter:card", content: "summary" },{ title: "Import CSV — Clearpath" }, { name: "description", content: "Upload a claims CSV and triage it with the active policy." }] }),
  component: ImportPage,
});

function ImportPage() {
  const { me } = useRole();
  const { data: policy } = useQuery(activePolicyQuery);
  const qc = useQueryClient();
  const [claims, setClaims] = useState<ParsedClaim[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [importedName, setImportedName] = useState("");

  const preview: Partial<Record<Queue, number>> = {};
  if (claims && policy) for (const c of claims) {
    const q = queueFor(decide(c, policy).recommendation, isClosed(c.case_status));
    preview[q] = (preview[q] ?? 0) + 1;
  }

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null); setResult(null); setFileName(f.name);
    try { setClaims(parseClaimsCsv(await f.text())); } catch (e) { setError((e as Error).message); setClaims(null); }
  };

  const run = async () => {
    if (!claims || !policy) return;
    setBusy(true);
    try {
      const r = await importClaims(claims, policy, me.name);
      setResult(r);
      setImportedName(fileName);
      setShowResult(true);
      await qc.invalidateQueries();
      toast(`Imported ${r.inserted} cases`);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader eyebrow="All roles" title="Import CSV" sub={`Claims are triaged with policy ${policy?.version ?? "…"} and routed to queues. Closed claims keep their decision.`} />
      <Card className="max-w-2xl">
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-text-3 px-6 py-10 text-center hover:bg-surface-2">
          <span className="font-medium">{fileName || "Choose a claims CSV"}</span>
          <span className="mt-1 text-[12px] text-text-2">case_id, case_status, claim_summary, policy_active_on_incident, … evidence_conflict</span>
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {error && <p className="mt-4 text-[13px] text-action">{error}</p>}
        {claims && (
          <div className="mt-6">
            <p className="label-mono mb-3">{claims.length} rows parsed · preview</p>
            <dl className="grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
              {(Object.keys(QUEUE_LABELS) as Queue[]).map((q) => (
                <div key={q} className="rounded-md border border-line p-3">
                  <dt className="label-mono">{QUEUE_LABELS[q]}</dt>
                  <dd className="num mt-1 text-[20px] font-medium">{preview[q] ?? 0}</dd>
                </div>
              ))}
            </dl>
            <Button className="mt-6" onClick={run} disabled={busy}>{busy ? "Importing…" : `Import ${claims.length} claims`}</Button>
          </div>
        )}
        {result && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-[13px] text-text-2">
            <span>
              {result.inserted} cases triaged{result.frozen ? `, ${result.frozen} closed cases left unchanged` : ""}
              {result.secondChecks ? `, ${result.secondChecks} flagged for a second check` : ""}.
            </span>
            <Button variant="outline" onClick={() => setShowResult(true)}>
              Show this import
            </Button>
          </div>
        )}
      </Card>
      {result && policy && (
        <ImportResultDialog open={showResult} onOpenChange={setShowResult} fileName={importedName} version={policy.version} result={result} />
      )}
    </div>
  );
}
