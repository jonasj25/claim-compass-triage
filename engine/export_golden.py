"""Write the Python engine's decisions for every CSV in data/ to data/golden/decisions.json.

    python engine/export_golden.py

src/lib/parity.test.ts runs the TypeScript engine (src/lib/triage.ts) on the same CSVs and
policies and fails if any recommendation or rule_id differs. tests/test_engine.py fails if this
file is stale. Re-run this script after every change to engine/triage.py or policies/*.json.
"""
import csv
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from triage import ROOT, decide, load_policy, normalise  # noqa: E402

GOLDEN = os.path.join(ROOT, "data", "golden", "decisions.json")


def build():
    policies = {os.path.basename(p)[:-5]: load_policy(p)
                for p in sorted(glob.glob(os.path.join(ROOT, "policies", "*.json")))}
    out = {}
    for path in sorted(glob.glob(os.path.join(ROOT, "data", "*.csv"))):
        with open(path, newline="", encoding="utf-8-sig") as f:
            rows = list(csv.DictReader(f))
        cases = {}
        for r in rows:
            c = normalise(r)
            if not c.get("case_id"):
                continue
            cases[c["case_id"]] = {
                name: dict(zip(("recommendation", "rule_id"), decide(c, pol)[:2]))
                for name, pol in policies.items()
            }
        out[os.path.basename(path)] = cases
    return out


def write():
    os.makedirs(os.path.dirname(GOLDEN), exist_ok=True)
    with open(GOLDEN, "w", encoding="utf-8") as f:
        json.dump(build(), f, indent=1, sort_keys=True)
        f.write("\n")


if __name__ == "__main__":
    write()
    print(f"Wrote {GOLDEN}")
