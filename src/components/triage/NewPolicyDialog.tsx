import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  KNOWN_CLAIM_TYPES,
  KNOWN_DOCUMENTS,
  KNOWN_FLAGS,
  KNOWN_REPAIR_TYPES,
  claimTypeText,
  diffPolicies,
  docText,
  flagText,
  nextVersionId,
  repairTypeText,
} from "@/lib/policy-text";
import type { Policy } from "@/lib/triage";
import { useRole } from "@/lib/role";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const ID_RE = /^[a-z0-9][a-z0-9._-]{0,30}$/i;

function toggle(xs: string[], v: string, on: boolean) {
  return on ? (xs.includes(v) ? xs : [...xs, v]) : xs.filter((x) => x !== v);
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-2.5 border-t border-line pt-4">
      <legend className="sr-only">{title}</legend>
      <p className="text-[13px] font-medium">{title}</p>
      {hint && <p className="-mt-1.5 text-[12px] text-text-3">{hint}</p>}
      {children}
    </fieldset>
  );
}

function CheckRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2.5 text-[13px]">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      {label}
    </label>
  );
}

export function NewPolicyDialog({ base, existingIds }: { base: Policy; existingIds: string[] }) {
  const { me } = useRole();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [id, setId] = useState("");
  const [description, setDescription] = useState("");
  const [draft, setDraft] = useState<Policy>(base);
  const [noLimit, setNoLimit] = useState(false);
  const [limit, setLimit] = useState("");

  const start = () => {
    setId(nextVersionId(existingIds));
    setDescription("");
    setDraft(structuredClone(base));
    setNoLimit(base.human_review.quote_limit_eur === null);
    setLimit(
      base.human_review.quote_limit_eur === null ? "" : String(base.human_review.quote_limit_eur),
    );
    setOpen(true);
  };

  const hr = draft.human_review;
  const setHr = (patch: Partial<Policy["human_review"]>) =>
    setDraft((d) => ({ ...d, human_review: { ...d.human_review, ...patch } }));

  const limitNum = noLimit ? null : limit.trim() === "" ? NaN : Number(limit);
  const candidate: Policy = {
    ...draft,
    version: id.trim(),
    description: description.trim() || undefined,
    human_review: {
      ...hr,
      quote_limit_eur: limitNum === null || Number.isNaN(limitNum) ? null : limitNum,
    },
  };
  const changes = diffPolicies(base, candidate);

  const errors: string[] = [];
  if (!ID_RE.test(id.trim())) errors.push("Version name: letters, numbers, dots or dashes.");
  else if (existingIds.includes(id.trim())) errors.push(`Version "${id.trim()}" already exists.`);
  if (!noLimit && (Number.isNaN(limitNum) || (limitNum ?? 0) < 0))
    errors.push("Quote limit must be a positive number, or tick “No limit”.");
  if (!hr.allowed_claim_types.length)
    errors.push("Allow at least one claim type for routine handling.");
  if (!changes.length && !errors.length) errors.push("No rule changes yet.");

  const save = async () => {
    if (errors.length) return;
    setBusy(true);
    const config = {
      ...candidate,
      description: candidate.description ?? `Policy ${candidate.version}`,
    };
    const { error } = await supabase.from("policy_versions").insert({
      id: candidate.version,
      config: config as never,
      description: config.description,
      status: "draft",
      created_by: me.name,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["policy"] });
    setOpen(false);
    toast(`Draft ${candidate.version} saved`, {
      description: "No claim changes until a version is activated.",
      action: {
        label: "See impact",
        onClick: () => navigate({ to: "/impact", search: { v: candidate.version } }),
      },
    });
  };

  return (
    <>
      <Button onClick={start}>
        <Plus className="size-4" strokeWidth={1.75} /> New policy version
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New policy version</DialogTitle>
            <DialogDescription>
              Starts as a copy of {base.version}. It is saved as a draft and changes no claims;
              check it on Change impact first.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor="pv-id">Version</Label>
                <Input
                  id="pv-id"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pv-desc">What and why</Label>
                <Input
                  id="pv-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Lower routine limit; EV battery work needs a specialist"
                />
              </div>
            </div>

            <Section title="Send to a person when…" hint="Any one of these is enough.">
              <label className="flex cursor-pointer items-center justify-between gap-3 text-[13px]">
                The policy was not active on the incident date
                <Switch
                  checked={hr.require_policy_active}
                  onCheckedChange={(v) => setHr({ require_policy_active: v })}
                />
              </label>
              <div className="flex flex-wrap items-center gap-3 text-[13px]">
                <span>The repair quote is above</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-text-2">€</span>
                  <Input
                    aria-label="Quote limit in euros"
                    type="number"
                    min={0}
                    step="1"
                    value={limit}
                    disabled={noLimit}
                    onChange={(e) => setLimit(e.target.value)}
                    className="h-8 w-28 font-mono"
                  />
                </div>
                <CheckRow
                  id="pv-nolimit"
                  label="No limit"
                  checked={noLimit}
                  onChange={setNoLimit}
                />
              </div>
              {KNOWN_FLAGS.map((f) => (
                <CheckRow
                  key={f}
                  id={`pv-flag-${f}`}
                  label={flagText(f).charAt(0).toUpperCase() + flagText(f).slice(1)}
                  checked={hr.flag_fields.includes(f)}
                  onChange={(v) => setHr({ flag_fields: toggle(hr.flag_fields, f, v) })}
                />
              ))}
              {[...new Set([...KNOWN_REPAIR_TYPES, ...hr.review_repair_types])].map((t) => (
                <CheckRow
                  key={t}
                  id={`pv-repair-${t}`}
                  label={`The repair is ${repairTypeText(t)}`}
                  checked={hr.review_repair_types.includes(t)}
                  onChange={(v) =>
                    setHr({ review_repair_types: toggle(hr.review_repair_types, t, v) })
                  }
                />
              ))}
            </Section>

            <Section
              title="Claim types that can be handled routinely"
              hint="Any other claim type goes to a person."
            >
              {[...new Set([...KNOWN_CLAIM_TYPES, ...hr.allowed_claim_types])].map((t) => (
                <CheckRow
                  key={t}
                  id={`pv-type-${t}`}
                  label={claimTypeText(t).charAt(0).toUpperCase() + claimTypeText(t).slice(1)}
                  checked={hr.allowed_claim_types.includes(t)}
                  onChange={(v) =>
                    setHr({ allowed_claim_types: toggle(hr.allowed_claim_types, t, v) })
                  }
                />
              ))}
            </Section>

            <Section title="Documents required before routine processing">
              {[...new Set([...KNOWN_DOCUMENTS, ...draft.required_documents])].map((d) => (
                <CheckRow
                  key={d}
                  id={`pv-doc-${d}`}
                  label={docText(d).charAt(0).toUpperCase() + docText(d).slice(1)}
                  checked={draft.required_documents.includes(d)}
                  onChange={(v) =>
                    setDraft((p) => ({
                      ...p,
                      required_documents: toggle(p.required_documents, d, v),
                    }))
                  }
                />
              ))}
            </Section>

            <div className="card-quiet p-4">
              <p className="label-mono mb-2">Changes vs {base.version}</p>
              {changes.length ? (
                <ul className="space-y-1 text-[13px]">
                  {changes.map((c) => (
                    <li key={c}>• {c}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-text-3">None yet.</p>
              )}
            </div>
            {errors.length > 0 && changes.length > 0 && (
              <ul className="space-y-1 text-[12px] text-action">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy || errors.length > 0}>
              {busy ? "Saving…" : "Save as draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
