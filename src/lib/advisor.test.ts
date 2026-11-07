import { describe, expect, it } from "vitest";
import { advise, draftFrom, GOALS } from "./advisor";
import { BATCH_POLICY_V2 } from "./batch";
import { defaultInputs } from "./business";
import { VOLUME_CLAIMS } from "./quality";

const i = defaultInputs();

describe("policy advisor", () => {
  it("within current rules never relaxes the quote limit", () => {
    const r = advise(VOLUME_CLAIMS, BATCH_POLICY_V2, i, false);
    for (const g of GOALS) expect(r.best[g.key].limit).toBeLessThanOrEqual(1200);
    expect(r.candidates.every((c) => c.limit <= 1200)).toBe(true);
    expect(r.baseline).toMatchObject({ limit: 1200, margin: 70, qa: 0.07 });
  });

  it("each goal is at least as good as today on its own measure", () => {
    for (const relax of [false, true]) {
      const r = advise(VOLUME_CLAIMS, BATCH_POLICY_V2, i, relax);
      expect(r.best.financial.total).toBeLessThanOrEqual(r.baseline.total + 1e-6);
      expect(r.best.customer.days).toBeLessThanOrEqual(r.baseline.days + 1e-6);
      expect(r.best.time.hours).toBeLessThanOrEqual(r.baseline.hours + 1);
      // guardrail: customer and time suggestions never add expected loss
      expect(r.best.customer.risk).toBeLessThanOrEqual(r.baseline.risk * 1.0001);
      expect(r.best.time.risk).toBeLessThanOrEqual(r.baseline.risk * 1.0001);
    }
  });

  it("explore mode can suggest a higher limit and flags it as a relaxation", () => {
    const r = advise(VOLUME_CLAIMS, BATCH_POLICY_V2, i, true);
    expect(r.evaluated).toBeGreaterThan(1000);
    const anyRelax = GOALS.some((g) => r.relaxes(r.best[g.key]));
    expect(typeof anyRelax).toBe("boolean");
    expect(r.relaxes({ limit: 1300, margin: 0, qa: 0 })).toBe(true);
    expect(r.relaxes({ limit: 1200, margin: 0, qa: 0 })).toBe(false);
  });

  it("a suggestion becomes a draft that only changes the quote limit", () => {
    const d = draftFrom(BATCH_POLICY_V2, { limit: 1100, margin: 100, qa: 0.05 }, "v3", "financial");
    expect(d.version).toBe("v3");
    expect(d.human_review.quote_limit_eur).toBe(1100);
    expect(d.human_review.review_repair_types).toEqual(
      BATCH_POLICY_V2.human_review.review_repair_types,
    );
    expect(d.human_review.flag_fields).toEqual(BATCH_POLICY_V2.human_review.flag_fields);
    expect(d.required_documents).toEqual(BATCH_POLICY_V2.required_documents);
  });
});

describe("balanced recommendation", () => {
  it("is never worse than today on cost, reviewer hours, customer wait or expected losses", () => {
    for (const relax of [false, true]) {
      const r = advise(VOLUME_CLAIMS, BATCH_POLICY_V2, i, relax);
      const s = r.balanced;
      expect(s.total).toBeLessThanOrEqual(r.baseline.total * 1.0001);
      expect(s.hours).toBeLessThanOrEqual(r.baseline.hours * 1.0001);
      expect(s.days).toBeLessThanOrEqual(r.baseline.days + 1e-9);
      expect(s.risk).toBeLessThanOrEqual(r.baseline.risk * 1.0001);
      if (!relax) expect(s.limit).toBeLessThanOrEqual(1200);
    }
  });
});
