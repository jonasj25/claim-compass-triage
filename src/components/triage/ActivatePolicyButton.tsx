import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { activatePolicy, planActivation } from "@/lib/activate";
import type { CaseRow } from "@/lib/data";
import type { Impact } from "@/lib/impact";
import { diffPolicies } from "@/lib/policy-text";
import { useRole } from "@/lib/role";
import type { Policy } from "@/lib/triage";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function ActivatePolicyButton({
  cases,
  active,
  candidate,
  createdBy,
  impact,
}: {
  cases: CaseRow[];
  active: Policy;
  candidate: Policy;
  createdBy: string | null;
  impact: Impact;
}) {
  const { me } = useRole();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const plan = planActivation(cases, active, candidate);
  const changes = diffPolicies(active, candidate);
  const q = impact.quality;
  const worseRoutine = q ? q.after.wrongRoutine > q.before.wrongRoutine : false;

  async function run() {
    setBusy(true);
    try {
      await activatePolicy(plan, me.name);
      await qc.invalidateQueries();
      toast(`Policy ${candidate.version} is active`, {
        description: plan.changed.length
          ? `${plan.changed.length} open claims changed and are flagged for recheck. Closed claims were not touched.`
          : "No open claim changed its next step.",
        action: { label: "View claims", onClick: () => navigate({ to: "/dashboard" }) },
      });
    } catch (e) {
      toast.error(`Activation failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button disabled={busy}>{busy ? "Activating…" : `Activate ${candidate.version}`}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Replace {active.version} with {candidate.version}?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-[13.5px] text-text-2">
              {changes.length > 0 && (
                <ul className="space-y-0.5 text-foreground">
                  {changes.map((c) => (
                    <li key={c}>• {c}</li>
                  ))}
                </ul>
              )}
              <ul className="space-y-1">
                <li>
                  {plan.open.length} open claims are re-decided under {candidate.version}.
                </li>
                <li className="text-foreground">
                  {plan.changed.length} change their next step and are flagged for recheck.
                </li>
                <li>{plan.closedUntouched} closed claims keep their decision.</li>
                <li>
                  Every new decision records {candidate.version}; the old ones stay in the history.
                </li>
              </ul>
              {worseRoutine && (
                <p className="text-action">
                  Warning: on labelled claims, {candidate.version} makes more wrong routine
                  decisions than {active.version} ({q!.after.wrongRoutine} vs{" "}
                  {q!.before.wrongRoutine}).
                </p>
              )}
              {createdBy && createdBy === me.name && (
                <p>You created this draft. In production, a second person would approve it.</p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={run}>Activate {candidate.version}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
