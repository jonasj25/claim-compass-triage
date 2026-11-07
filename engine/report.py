"""Quality report on a labelled CSV (needs expected_v1 and/or expected_v2 columns).

    python engine/report.py data/dev_cases.csv

Reports per policy version:
  * accuracy (share of correct next-step recommendations)
  * wrong routine rate   - predicted routine_processing, label is not (the expensive error)
  * unnecessary HR rate  - predicted human_review, label is not
  * changed cases separately (label differs between v1 and v2)
  * blank-field cases separately
"""
import csv
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from triage import HR, RP, ROOT, load_policy, normalise, decide  # noqa: E402


def metrics(pairs):
    n = len(pairs)
    if n == 0:
        return "n=0"
    correct = sum(p == e for p, e in pairs)
    wrong_rp = sum(p == RP and e != RP for p, e in pairs)
    unnec_hr = sum(p == HR and e != HR for p, e in pairs)
    return (f"n={n}  accuracy={correct}/{n} ({correct / n:.0%})  "
            f"wrong_routine={wrong_rp} ({wrong_rp / n:.0%})  unnecessary_HR={unnec_hr} ({unnec_hr / n:.0%})")


def main(path, v1_path=None, v2_path=None):
    p1 = load_policy(v1_path or os.path.join(ROOT, "policies", "v1.json"))
    p2 = load_policy(v2_path or os.path.join(ROOT, "policies", "v2.json"))
    rows = list(csv.DictReader(open(path, newline="", encoding="utf-8-sig")))
    has_v2 = rows and "expected_v2" in rows[0]

    for ver, pol, col in [("v1", p1, "expected_v1"), ("v2", p2, "expected_v2")]:
        if col not in rows[0]:
            continue
        pairs, blanks, changed, errors = [], [], [], []
        for r in rows:
            c = normalise(r)
            pred, rule, why = decide(c, pol)
            exp = r[col]
            pairs.append((pred, exp))
            if any((v or "").strip() == "" for k, v in r.items() if not k.startswith("expected")):
                blanks.append((pred, exp))
            if has_v2 and r["expected_v1"] != r["expected_v2"]:
                changed.append((pred, exp))
            if pred != exp:
                errors.append(f"    {r['case_id']}: predicted {pred} ({rule}), expected {exp}")
        print(f"== {ver} ({pol['version']}) ==")
        print("  all cases     ", metrics(pairs))
        print("  blank-field   ", metrics(blanks))
        if has_v2:
            print("  changed cases ", metrics(changed))
        print("  errors:" if errors else "  errors: none")
        for e in errors:
            print(e)


if __name__ == "__main__":
    main(*sys.argv[1:])
