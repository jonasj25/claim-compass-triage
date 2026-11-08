import { Link } from "@tanstack/react-router";
import { effectiveRec } from "@/lib/effective";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { assignCases, loads, needsReviewer, planDistribution } from "@/lib/assignment";
import type { CaseRow } from "@/lib/data";
import { REVIEWERS } from "@/lib/lifecycle";
import { useRole } from "@/lib/role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, StatusDot } from "./ui";
import { HBars, SERIES } from "./charts";

/** Manager view: reviewer load, even distribution of unassigned claims, and per-claim assignment. */
export function AssignmentPanel({ cases }: { cases: CaseRow[] }) {
  const { me } = useRole();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { perReviewer, unassigned } = loads(cases);
  const [keep, setKeep] = useState(() => Math.min(20, unassigned));
  const plan = planDistribution(cases, keep);
  const toAssign = [...plan.values()].reduce((n, ids) => n + ids.length, 0);
  const open = cases
    .filter((c) => needsReviewer(c) && !c.workflow?.assignee)
    .sort(
      (a, b) =>
        (Date.parse(a.claim.received_at ?? "") || 0) - (Date.parse(b.claim.received_at ?? "") || 0),
    );

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["cases"] }),
      qc.invalidateQueries({ queryKey: ["case"] }),
    ]);

  const distribute = async () => {
    setBusy(true);
    try {
      for (const [who, ids] of plan) if (ids.length) await assignCases(ids, who, me.name);
      await refresh();
      toast(
        `${toAssign} claims distributed across ${[...plan.values()].filter((v) => v.length).length} reviewers`,
        {
          description: `${unassigned - toAssign} left unassigned for "Assign to me".`,
        },
      );
    } catch (e) {
      toast.error(`Could not assign: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const assignOne = async (caseId: string, who: string) => {
    try {
      await assignCases([caseId], who, me.name);
      await refresh();
      toast(`${caseId} assigned to ${who}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="section-title">Assignment</h2>
          <p className="mt-1 text-[13px] text-text-2">
            New claims that need a person are assigned automatically to the reviewer with the fewest
            open claims. Use this for the older backlog.{" "}
            <span className="font-medium text-foreground">{unassigned}</span> unassigned.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <label className="flex items-center gap-2 text-text-2">
            Leave unassigned
            <Input
              type="number"
              min={0}
              max={unassigned}
              value={keep}
              onChange={(e) =>
                setKeep(Math.max(0, Math.min(unassigned, Number(e.target.value) || 0)))
              }
              className="h-8 w-20 bg-white text-right font-mono"
              aria-label="Claims to leave unassigned"
            />
          </label>
          <Button onClick={() => void distribute()} disabled={busy || toAssign === 0}>
            <Users className="size-4" strokeWidth={1.7} />{" "}
            {busy ? "Assigning…" : `Distribute evenly · ${toAssign}`}
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <div>
          <p className="mb-3 text-[12.5px] text-text-2">
            Load per reviewer{toAssign ? " (after distributing, in brackets)" : ""}
          </p>
          <HBars
            items={perReviewer.map(([name, n]) => {
              const add = plan.get(name)?.length ?? 0;
              return {
                key: name,
                label: name,
                value: n + add,
                display: add ? `${n} (${n + add})` : String(n),
                color: SERIES.strong,
              };
            })}
          />
        </div>
        <div>
          <p className="mb-3 text-[12.5px] text-text-2">Unassigned, oldest first</p>
          {open.length ? (
            <ul className="divide-y divide-line rounded-[10px] ring-1 ring-line">
              {open.slice(0, 8).map((c) => (
                <li key={c.claim.case_id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                  <Link
                    to="/claims/$caseId"
                    params={{ caseId: c.claim.case_id }}
                    className="w-[78px] shrink-0 font-mono text-[12px] hover:underline"
                  >
                    {c.claim.case_id}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-text-2">
                    {c.intake?.customer_name ?? c.claim.claim_summary}
                  </span>
                  {c.decision && (
                    <StatusDot
                      rec={effectiveRec(c) ?? c.decision.recommendation}
                      plain
                      className="hidden sm:inline-flex"
                    />
                  )}
                  <Select onValueChange={(v) => void assignOne(c.claim.case_id, v)}>
                    <SelectTrigger
                      aria-label={`Assign ${c.claim.case_id}`}
                      className="h-8 w-[140px] bg-white text-[12px]"
                    >
                      <SelectValue placeholder="Assign to…" />
                    </SelectTrigger>
                    <SelectContent>
                      {REVIEWERS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </li>
              ))}
              {open.length > 8 && (
                <li className="px-3 py-2 text-[12px] text-text-3">+ {open.length - 8} more</li>
              )}
            </ul>
          ) : (
            <p className="text-[13px] text-text-2">Every claim that needs a person has an owner.</p>
          )}
        </div>
      </div>
    </Card>
  );
}
