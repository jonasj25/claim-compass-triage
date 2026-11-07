"""Claims triage rules engine (config-driven, policy versions in /policies).

Batch usage (the path judges run):
    python engine/triage.py <input.csv> <results.csv> [--v1 policies/v1.json] [--v2 policies/v2.json]

Output columns: case_id, recommendation_v1, recommendation_v2, needs_recheck,
rule_v1, rule_v2, explanation

Principles (from the policy):
  * Structured fields are the source of truth; claim_summary is descriptive only.
  * Rules apply in order: known human-review trigger > missing fact/document > routine.
  * A blank or unreadable field is an absent fact. It is never guessed.
    -> request_information, unless a KNOWN fact already requires human_review.
  * Only fields the active policy actually uses count as missing.
  * Closed claims keep their v1 decision; needs_recheck is False for them.
"""
import argparse
import csv
import json
import math
import os
import re

HR, RI, RP = "human_review", "request_information", "routine_processing"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

OUTPUT_COLUMNS = ["case_id", "recommendation_v1", "recommendation_v2", "needs_recheck",
                  "rule_v1", "rule_v2", "explanation"]


# ---------- parsing: blank stays None, never becomes False/0 ----------

def parse_bool(v):
    v = (v or "").strip().lower()
    if v in ("true", "1", "yes", "y", "t"):
        return True
    if v in ("false", "0", "no", "n", "f"):
        return False
    return None


_NUMBER = re.compile(r"^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$")


def parse_num(v):
    """Strip EUR sign and thousands commas; anything that is not a plain number -> None.
    Mirrors parseQuote() in src/lib/csv.ts (rejects 'nan', 'inf', '1_500', 'n/a', ...)."""
    v = (v or "").replace("€", "").replace(",", "").strip()
    if not v or not _NUMBER.match(v):
        return None
    n = float(v)
    return n if math.isfinite(n) else None


def parse_text(v):
    v = (v or "").strip()
    return v or None


BOOL_FIELDS = ["policy_active_on_incident", "incident_report_present", "itemized_quote_present",
               "injury_reported", "liability_disputed", "duplicate_flag", "evidence_conflict"]


def normalise(row):
    c = {k: parse_text(v) for k, v in row.items() if k is not None}
    for f in BOOL_FIELDS:
        c[f] = parse_bool(row.get(f))
    c["quote_eur"] = parse_num(row.get("quote_eur"))
    c["case_status"] = (c.get("case_status") or "").lower() or None
    return c


def load_policy(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# ---------- decision ----------

def decide(c, policy):
    """Return (recommendation, rule_id, reason) for one normalised claim."""
    v = policy["version"]
    hr = policy["human_review"]
    triggers, missing = [], []

    # Rule 1 - known reasons for human review
    if hr.get("require_policy_active"):
        if c["policy_active_on_incident"] is False:
            triggers.append("policy not active on incident date")
        elif c["policy_active_on_incident"] is None:
            missing.append("policy_active_on_incident")

    if c.get("claim_type") is None:
        missing.append("claim_type")
    elif c["claim_type"] not in hr["allowed_claim_types"]:
        triggers.append(f"claim_type '{c['claim_type']}' is not {'/'.join(hr['allowed_claim_types'])}")

    for f in hr["flag_fields"]:
        if c.get(f) is True:
            triggers.append(f"{f} = True")
        elif c.get(f) is None:
            missing.append(f)

    limit = hr.get("quote_limit_eur")
    if limit is not None:
        if c["quote_eur"] is None:
            missing.append("quote_eur")
        elif c["quote_eur"] > limit:
            triggers.append(f"quote EUR {c['quote_eur']:g} > limit EUR {limit:g}")

    review_types = hr.get("review_repair_types") or []
    if review_types:
        if c.get("repair_type") is None:
            missing.append("repair_type")
        elif c["repair_type"] in review_types:
            triggers.append(f"repair_type '{c['repair_type']}' requires human review")

    if triggers:
        return HR, f"{v}.R1", "Human review: " + "; ".join(triggers)

    # Absent facts -> request information (only reached if no known HR trigger)
    docs_missing = []
    for d in policy["required_documents"]:
        if c.get(d) is None:
            missing.append(d)
        elif c[d] is False:
            docs_missing.append(d.replace("_present", "").replace("_", " "))
    if missing:
        return RI, f"{v}.BLANK", "Request information: absent/unreadable field(s): " + ", ".join(missing)

    # Rule 2 - missing documents
    if docs_missing:
        return RI, f"{v}.R2", "Request information: missing " + " and ".join(docs_missing)

    # Rule 3
    return RP, f"{v}.R3", "Routine processing: no review trigger, documents complete (not a payment approval)"


def evaluate(c, p1, p2):
    r1, rule1, why1 = decide(c, p1)
    if c["case_status"] == "closed":
        return {"case_id": c.get("case_id"), "recommendation_v1": r1, "recommendation_v2": r1,
                "needs_recheck": False, "rule_v1": rule1, "rule_v2": rule1,
                "explanation": f"[{p1['version']}] {why1} || [closed] {p1['version']} decision retained; not re-evaluated"}
    # Open, or blank status (treated as open so it is not silently frozen)
    r2, rule2, why2 = decide(c, p2)
    return {"case_id": c.get("case_id"), "recommendation_v1": r1, "recommendation_v2": r2,
            "needs_recheck": r2 != r1, "rule_v1": rule1, "rule_v2": rule2,
            "explanation": f"[{p1['version']}] {why1} || [{p2['version']}] {why2}"}


def run(inp, out, p1_path, p2_path):
    p1, p2 = load_policy(p1_path), load_policy(p2_path)
    with open(inp, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    results = [evaluate(normalise(r), p1, p2) for r in rows]
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=OUTPUT_COLUMNS)
        w.writeheader()
        w.writerows(results)
    return rows, results


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Claims triage batch run")
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--v1", default=os.path.join(ROOT, "policies", "v1.json"))
    ap.add_argument("--v2", default=os.path.join(ROOT, "policies", "v2.json"))
    a = ap.parse_args()
    _, res = run(a.input, a.output, a.v1, a.v2)
    print(f"Wrote {len(res)} rows to {a.output}; {sum(r['needs_recheck'] for r in res)} need recheck")
