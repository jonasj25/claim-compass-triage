import { useState } from "react";
import { ArrowRight, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  planReopen,
  REOPEN_REASONS,
  reopenCase,
  reopenProblem,
  type ReopenAssign,
  type ReopenReason,
} from "@/lib/reopen";
import { RECOMMENDATION_LABELS, type Claim, type Policy, type Recommendation } from "@/lib/triage";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Reopen a closed or finished claim. Shows what the rules say under the active policy before anything is saved.

export function ReopenDialog({
  caseId,
  claim,
  policy,
  current,
  actor,
  previousAssignee,
  onDone,
  disabled,
}: {
  caseId: string;
  claim: Claim;
  policy: Policy;
  /** The recommendation the claim was closed with */
  current: Recommendation | null;
  actor: string;
  previousAssignee: string | null;
  onDone: (msg: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReopenReason | "">("");
  const [note, setNote] = useState("");
  const [assign, setAssign] = useState<ReopenAssign>("me");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = planReopen(claim, policy, current);
  const rec = plan.decision.recommendation;

  const save = async () => {
    const problem = reopenProblem(reason, note);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const r = await reopenCase(supabase, {
        caseId,
        reason: reason as ReopenReason,
        note,
        actor,
        policy,
        assign,
      });
      setOpen(false);
      setReason("");
      setNote("");
      onDone(
        `Claim reopened · ${RECOMMENDATION_LABELS[r.decision.recommendation]} under ${policy.version.toUpperCase()}${r.assignee ? ` · ${r.assignee}` : ""}`,
      );
    } catch (e) {
      setError((e as Error).message || "Could not reopen the claim.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        className="mt-3 w-full"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <RotateCcw className="size-4" /> Reopen claim
      </Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Reopen {caseId}</DialogTitle>
            <DialogDescription>
              The claim is checked again under the active policy and goes to To review. The earlier
              decision and outcome stay in the history.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-[10px] bg-surface-2 px-4 py-3 text-[13px] ring-1 ring-line">
            <p className="label-mono text-[9.5px]">Rules under {policy.version.toUpperCase()}</p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5">
              {current && (
                <>
                  <span className="text-text-2">{RECOMMENDATION_LABELS[current]}</span>
                  <ArrowRight className="size-3.5 text-text-3" />
                </>
              )}
              <span className="font-medium">{RECOMMENDATION_LABELS[rec]}</span>
              {plan.changed && (
                <span className="text-[12px] text-action">· changed, flagged for recheck</span>
              )}
            </p>
            <p className="mt-1 text-[12px] text-text-2">{plan.decision.reasons[0]}</p>
          </div>

          <div>
            <Label className="text-[12px]">Why is it reopened?</Label>
            <div role="radiogroup" aria-label="Reason" className="mt-2 grid gap-1.5">
              {REOPEN_REASONS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  role="radio"
                  aria-checked={reason === r.key}
                  onClick={() => {
                    setReason(r.key);
                    setError(null);
                  }}
                  className={cn(
                    "rounded-[8px] px-3 py-2 text-left text-[13px] ring-1 transition-colors",
                    reason === r.key
                      ? "bg-link/10 font-medium ring-link"
                      : "bg-surface ring-line hover:ring-link/40",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="reopen-note" className="text-[12px]">
              Note {reason === "other" ? "" : "(optional)"}
            </Label>
            <Textarea
              id="reopen-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What changed? e.g. customer sent a second quote for the rear light"
              className="mt-1.5 min-h-[70px]"
            />
          </div>

          <div>
            <Label className="text-[12px]">Who handles it</Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(
                [
                  ["me", "Me"],
                  ...(previousAssignee && previousAssignee !== actor
                    ? ([["previous", previousAssignee]] as const)
                    : []),
                  ["auto", "Auto-assign (lowest load)"],
                ] as [ReopenAssign, string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={assign === k}
                  onClick={() => setAssign(k)}
                  className={cn(
                    "rounded-full px-3 py-1 text-[12.5px] ring-1",
                    assign === k
                      ? "bg-link/10 font-medium ring-link"
                      : "ring-line hover:ring-link/40",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p role="alert" className="text-[12.5px] text-action">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy || !reason} onClick={() => void save()}>
              {busy ? "Reopening…" : "Reopen claim"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
