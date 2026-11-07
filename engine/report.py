"""Before/after quality report on a labelled CSV (expected_v1 and/or expected_v2 columns).

    python engine/report.py data/dev_cases.csv [policies/v1.json policies/v2.json]

Scored the way the judges describe it:
  * v1: every case vs expected_v1.
  * v2: OPEN cases only vs expected_v2 (judges do not count closed claims in the v2 score);
        closed cases are checked separately: they must still show their v1 decision.
  * changed cases (expected_v1 != expected_v2) reported on their own, so a strong overall
    score cannot hide a failure on the new policy.
  * blank-field cases reported on their own.
Metrics: accuracy, wrong routine (routine recommended, label is not: the expensive error),
unnecessary human review (review recommended, label is not).
"""
import csv
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from triage import HR, RP, ROOT, evaluate, load_policy, normalise  # noqa: E402


def metrics(pairs):
    n = len(pairs)
    if n == 0:
        return "n=0"
    correct = sum(p == e for p, e in pairs)
    wrong_rp = sum(p == RP and e != RP for p, e in pairs)
    unnec_hr = sum(p == HR and e != HR for p, e in pairs)
    return (f"n={n}  accuracy={correct}/{n} ({correct / n:.0%})  "
            f"wrong_routine={wrong_rp} ({wrong_rp / n:.0%})  unnecessary_HR={unnec_hr} ({unnec_hr / n:.0%})")


def has_blank(row):
    return any((v or "").strip() == "" for k, v in row.items()
               if k and not k.startswith("expected") and k != "label_reason")


def main(path, v1_path=None, v2_path=None):
    p1 = load_policy(v1_path or os.path.join(ROOT, "policies", "v1.json"))
    p2 = load_policy(v2_path or os.path.join(ROOT, "policies", "v2.json"))
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    cols = rows[0].keys() if rows else []
    results = [(r, normalise(r), evaluate(normalise(r), p1, p2)) for r in rows]

    if "expected_v1" in cols:
        pairs = [(res["recommendation_v1"], r["expected_v1"]) for r, _, res in results]
        print(f"== {p1['version']} (all cases) ==")
        print("  all cases     ", metrics(pairs))
        print("  blank-field   ", metrics([pp for pp, (r, _, _) in zip(pairs, results) if has_blank(r)]))
        errs = [f"    {r['case_id']}: got {res['recommendation_v1']} ({res['rule_v1']}), expected {r['expected_v1']}"
                for r, _, res in results if res["recommendation_v1"] != r["expected_v1"]]
        print("  errors:" if errs else "  errors: none", *errs, sep="\n")

    if "expected_v2" in cols:
        open_rows = [(r, c, res) for r, c, res in results if c["case_status"] != "closed"]
        closed_rows = [(r, c, res) for r, c, res in results if c["case_status"] == "closed"]
        new = [(res["recommendation_v2"], r["expected_v2"]) for r, _, res in open_rows]
        old = [(res["recommendation_v1"], r["expected_v2"]) for r, _, res in open_rows]
        print(f"\n== {p2['version']} (open cases; closed excluded as the judges do) ==")
        print(f"  keep {p1['version']} rules  ", metrics(old))
        print(f"  switch to {p2['version']}  ", metrics(new))
        if "expected_v1" in cols:
            ch = [(r, res) for r, _, res in open_rows if r["expected_v1"] != r["expected_v2"]]
            print(f"  changed cases, keep {p1['version']} ", metrics([(res["recommendation_v1"], r["expected_v2"]) for r, res in ch]))
            print(f"  changed cases, {p2['version']}      ", metrics([(res["recommendation_v2"], r["expected_v2"]) for r, res in ch]))
        print("  blank-field   ", metrics([(res["recommendation_v2"], r["expected_v2"]) for r, _, res in open_rows if has_blank(r)]))
        recheck = [res["case_id"] for _, _, res in open_rows if res["needs_recheck"]]
        print(f"  open cases flagged needs_recheck: {len(recheck)} {recheck}")
        frozen_ok = all(res["recommendation_v2"] == res["recommendation_v1"] and not res["needs_recheck"]
                        for _, _, res in closed_rows)
        print(f"  closed cases kept their v1 decision: {len(closed_rows)}/{len(closed_rows)}" if frozen_ok
              else "  CLOSED CASES CHANGED - BUG")
        errs = [f"    {r['case_id']}: got {res['recommendation_v2']} ({res['rule_v2']}), expected {r['expected_v2']}"
                for r, _, res in open_rows if res["recommendation_v2"] != r["expected_v2"]]
        print("  errors:" if errs else "  errors: none", *errs, sep="\n")


if __name__ == "__main__":
    main(*sys.argv[1:])
