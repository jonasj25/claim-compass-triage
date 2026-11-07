// Parity between the app engine (src/lib/triage.ts) and the batch engine (engine/triage.py).
// The judges score the Python batch; reviewers see the TypeScript engine. They must never disagree.
// Golden file: data/golden/decisions.json, written by `python engine/export_golden.py`.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseClaimsCsv } from "./csv";
import { decide, POLICY_V1, type Policy } from "./triage";
import { batchToCsv, runBatch } from "./batch";

const ROOT = path.resolve(__dirname, "../..");
const read = (...p: string[]) => readFileSync(path.join(ROOT, ...p), "utf-8");

type Golden = Record<
  string,
  Record<string, Record<string, { recommendation: string; rule_id: string }>>
>;
const golden: Golden = JSON.parse(read("data", "golden", "decisions.json"));

const policies: Record<string, Policy> = Object.fromEntries(
  readdirSync(path.join(ROOT, "policies"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => [f.replace(/\.json$/, ""), JSON.parse(read("policies", f)) as Policy]),
);

describe("policy config", () => {
  it("POLICY_V1 in triage.ts equals policies/v1.json", () => {
    expect(POLICY_V1).toEqual(policies.v1);
  });
});

describe("TypeScript engine matches Python engine", () => {
  const csvFiles = readdirSync(path.join(ROOT, "data")).filter((f) => f.endsWith(".csv"));

  it("golden file covers every CSV in data/", () => {
    expect(Object.keys(golden).sort()).toEqual([...csvFiles].sort());
  });

  for (const file of csvFiles) {
    it(`${file}: same recommendation and rule for every case and policy`, () => {
      const claims = parseClaimsCsv(read("data", file));
      const expected = golden[file];
      expect(claims.map((c) => c.case_id).sort()).toEqual(Object.keys(expected).sort());
      const diffs: string[] = [];
      for (const c of claims) {
        for (const [name, policy] of Object.entries(policies)) {
          const d = decide(c, policy);
          const py = expected[c.case_id][name];
          if (!py) diffs.push(`${c.case_id} [${name}]: missing in golden file`);
          else if (d.recommendation !== py.recommendation || d.rule_id !== py.rule_id)
            diffs.push(
              `${c.case_id} [${name}]: ts=${d.recommendation}/${d.rule_id} py=${py.recommendation}/${py.rule_id}`,
            );
        }
      }
      expect(diffs).toEqual([]);
    });
  }
});

describe("website batch run matches Python batch (engine/triage.py)", () => {
  const csvFiles = readdirSync(path.join(ROOT, "data")).filter((f) => f.endsWith(".csv"));
  type BatchGolden = {
    recommendation_v1: string;
    recommendation_v2: string;
    needs_recheck: boolean;
    rule_v1: string;
    rule_v2: string;
  };

  for (const file of csvFiles) {
    it(`${file}: same v1, v2, needs_recheck and rules for every case`, () => {
      const rows = runBatch(parseClaimsCsv(read("data", file)));
      const diffs: string[] = [];
      for (const r of rows) {
        const py = (golden[file][r.case_id] as unknown as { _batch: BatchGolden })._batch;
        const ts: BatchGolden = {
          recommendation_v1: r.recommendation_v1,
          recommendation_v2: r.recommendation_v2,
          needs_recheck: r.needs_recheck,
          rule_v1: r.rule_v1,
          rule_v2: r.rule_v2,
        };
        const bad = (Object.keys(ts) as (keyof BatchGolden)[]).filter((k) => ts[k] !== py[k]);
        if (bad.length)
          diffs.push(`${r.case_id}: ${bad.map((k) => `${k} ts=${ts[k]} py=${py[k]}`).join(", ")}`);
      }
      expect(diffs).toEqual([]);
    });
  }

  it("results CSV has the judging header and True/False booleans", () => {
    const csv = batchToCsv(runBatch(parseClaimsCsv(read("data", "practice_cases.csv"))));
    const [header, first] = csv.split("\n");
    expect(header).toBe(
      "case_id,recommendation_v1,recommendation_v2,needs_recheck,rule_v1,rule_v2,explanation",
    );
    expect(first.split(",")[3]).toMatch(/^(True|False)$/);
  });
});
