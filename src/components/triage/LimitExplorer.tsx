import { useMemo, useState } from "react";
import { eur0, eurCompact, pct, triageEconomics, type Inputs } from "@/lib/business";
import { caseMix, claimListMix, useClaimMix } from "@/lib/claim-mix";
import { VOLUME_CLAIMS } from "@/lib/quality";
import type { Policy } from "@/lib/triage";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/triage/ui";

/** What a different routine quote limit would mean for workload, on the same claims and
 *  numbers as Workload & flow and the Business case. Nothing is saved: it only explores. */
const MIN = 600;
const MAX = 2000;

export function LimitExplorer({ inputs, className }: { inputs: Inputs; className?: string }) {
  const { mix, policy: active, source, cases } = useClaimMix("live");
  const currentLimit = active.human_review.quote_limit_eur ?? 1200;
  const [limitPick, setLimit] = useState<number | null>(null);
  const limit = limitPick ?? currentLimit;
  const econ = triageEconomics(inputs, mix, mix.secondShare);

  const explore = useMemo(() => {
    // At today's limit this is exactly today's mix; other limits re-decide the claims nobody overrode
    if (limit === currentLimit) return { mix, econ };
    const pol: Policy = {
      ...active,
      human_review: { ...active.human_review, quote_limit_eur: limit },
    };
    const m =
      source === "live"
        ? caseMix(cases, active, active, pol)
        : claimListMix(VOLUME_CLAIMS, pol, active);
    return { mix: m, econ: triageEconomics(inputs, m, m.secondShare) };
  }, [limit, currentLimit, mix, econ, source, cases, active, inputs]);

  return (
    <Card className={className}>
      <h2 className="section-title">Quote limit explorer</h2>
      <p className="mt-1 text-[13px] text-text-2">
        What a different routine limit would mean for workload, on the same claims (the active
        policy {active.version.toUpperCase()} sets {eur0(currentLimit)}). Exploring changes nothing;
        use a draft to change the policy.
      </p>
      <div className="mt-6 flex items-center gap-4">
        <span className="num text-[12px] text-text-3">{eur0(MIN)}</span>
        <Slider
          value={[limit]}
          min={MIN}
          max={MAX}
          step={50}
          onValueChange={([v]) => setLimit(v)}
          aria-label="Quote limit"
          className="flex-1 py-2"
        />
        <span className="num text-[12px] text-text-3">{eur0(MAX)}</span>
        <span className="num w-24 text-right text-[20px] font-semibold">{eur0(limit)}</span>
        <button
          type="button"
          onClick={() => setLimit(null)}
          disabled={limit === currentLimit}
          className="text-[12px] text-link hover:underline disabled:invisible"
        >
          Reset
        </button>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-3 text-[13px] lg:grid-cols-4">
        {[
          [
            "Auto-processed",
            pct(explore.mix.share.routine_processing),
            `${pct(mix.share.routine_processing)} at ${eur0(currentLimit)}`,
          ],
          [
            "Sent to a person",
            pct(explore.mix.share.human_review),
            `${pct(mix.share.human_review)} at ${eur0(currentLimit)}`,
          ],
          [
            "People on triage",
            `${explore.econ.fteWith.toFixed(1)} FTE`,
            `${econ.fteWith.toFixed(1)} FTE at the policy limit`,
          ],
          [
            "Net benefit / year",
            eurCompact(explore.econ.netPerYear),
            `${eurCompact(econ.netPerYear)} at the policy limit`,
          ],
        ].map(([k, v, sub]) => (
          <div key={k} className="rounded-[10px] bg-surface-2 p-3">
            <dt className="text-text-2">{k}</dt>
            <dd className="num mt-1 text-[22px] font-semibold">{v}</dd>
            <dd className="mt-0.5 text-[12px] text-text-3">{sub}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[12px] text-text-3">
        A higher limit saves reviewer time but lets more large claims through unchecked. Raising it
        above the written policy needs compliance approval.
      </p>
    </Card>
  );
}
