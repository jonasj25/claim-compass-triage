import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Inbox } from "lucide-react";
import { toast } from "sonner";
import { QUEUE_LABELS } from "@/lib/lifecycle";
import {
  missingItems,
  recordCustomerReply,
  replyText,
  type Answers,
  type MissingItem,
} from "@/lib/customer-reply";
import { RECOMMENDATION_LABELS, type Claim, type Policy } from "@/lib/triage";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const OPTION_LABEL: Record<string, string> = {
  motor_own_damage: "Own damage",
  theft: "Theft",
  glass: "Glass",
  standard: "Standard repair",
  ev_high_voltage_battery: "EV high-voltage battery",
};

function defaults(items: MissingItem[]): Answers {
  return Object.fromEntries(items.map((i) => [i.field, i.kind === "document" ? true : null]));
}

/** Demo helper: record the customer's reply with the missing items, then re-triage automatically. */
export function SimulateReplyDialog({
  caseId,
  claim,
  policy,
  customer,
  actor,
}: {
  caseId: string;
  claim: Claim;
  policy: Policy;
  customer: string | null;
  actor: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const items = missingItems(claim, policy);
  const [answers, setAnswers] = useState<Answers>(() => defaults(items));
  const set = (f: string, v: Answers[string]) => setAnswers((a) => ({ ...a, [f]: v }));

  const start = () => {
    setAnswers(defaults(items));
    setOpen(true);
  };

  const send = async () => {
    setBusy(true);
    try {
      const r = await recordCustomerReply({
        caseId,
        claim,
        policy,
        answers,
        items,
        customer,
        actor,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["case", caseId] }),
        qc.invalidateQueries({ queryKey: ["cases"] }),
      ]);
      setOpen(false);
      toast(`Customer replied · re-checked under ${policy.version.toUpperCase()}`, {
        description:
          r.queue === "waiting_customer"
            ? `Still missing: ${r.stillMissing.join(", ")}. A new request was sent.`
            : `${RECOMMENDATION_LABELS[r.after]} → ${QUEUE_LABELS[r.queue]}${r.secondCheck ? " (plus a second check)" : ""}`,
      });
    } catch (e) {
      toast.error(`Could not record the reply: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  if (!items.length) return null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={start} className="bg-white">
        <Inbox className="size-3.5" strokeWidth={1.8} /> Simulate customer reply
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>What did the customer send?</DialogTitle>
            <DialogDescription>
              Record what arrived. Anything left open stays unknown; nothing is guessed. The claim
              is then checked again under policy {policy.version.toUpperCase()}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {items.map((i) => (
              <div
                key={i.field}
                className="flex items-center justify-between gap-4 rounded-[10px] bg-surface-2/60 px-3.5 py-2.5 text-[13.5px]"
              >
                <span>{i.label}</span>
                {i.kind === "document" && (
                  <label className="flex cursor-pointer items-center gap-2 text-text-2">
                    <Checkbox
                      checked={answers[i.field] === true}
                      onCheckedChange={(v) => set(i.field, v === true ? true : null)}
                    />
                    Received
                  </label>
                )}
                {i.kind === "amount" && (
                  <Input
                    type="number"
                    min={0}
                    aria-label={i.label}
                    placeholder="unknown"
                    value={answers[i.field] === null ? "" : String(answers[i.field])}
                    onChange={(e) =>
                      set(i.field, e.target.value === "" ? null : Number(e.target.value))
                    }
                    className="h-8 w-32 bg-white font-mono"
                  />
                )}
                {(i.kind === "yesno" || i.kind === "choice") && (
                  <select
                    aria-label={i.label}
                    value={answers[i.field] === null ? "" : String(answers[i.field])}
                    onChange={(e) => {
                      const v = e.target.value;
                      set(i.field, v === "" ? null : i.kind === "yesno" ? v === "true" : v);
                    }}
                    className="h-8 rounded-[8px] border border-line bg-white px-2 text-[13px]"
                  >
                    <option value="">Still unknown</option>
                    {i.kind === "yesno" ? (
                      <>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </>
                    ) : (
                      i.options!.map((o) => (
                        <option key={o} value={o}>
                          {OPTION_LABEL[o] ?? o}
                        </option>
                      ))
                    )}
                  </select>
                )}
              </div>
            ))}
          </div>

          <div className="rounded-[10px] bg-white px-3.5 py-3 text-[12.5px] leading-relaxed whitespace-pre-line text-text-2 ring-1 ring-line">
            {replyText(customer, items, answers)}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void send()} disabled={busy}>
              {busy ? "Re-checking…" : "Receive reply & re-check"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
