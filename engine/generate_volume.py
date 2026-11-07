"""Generate a large UNLABELLED synthetic claim set for UI, dashboard, load and business-case demos.

    python engine/generate_volume.py data/synthetic_volume.csv --n 500 --seed 7

Not for accuracy measurement: labels produced by our own engine would be circular.
The distributions below are illustrative assumptions - tune them, and state them in the business case.
"""
import argparse
import csv
import random

COLUMNS = ["case_id", "case_status", "claim_summary", "policy_active_on_incident", "claim_type", "repair_type",
           "quote_eur", "incident_report_present", "itemized_quote_present", "injury_reported",
           "liability_disputed", "duplicate_flag", "evidence_conflict"]

SUMMARIES = ["Parking scrape on rear bumper.", "Side mirror broken in narrow street.", "Low-speed rear-end collision.",
             "Door dent from shopping trolley.", "Hail damage on bonnet and roof.", "Front bumper hit a bollard.",
             "Scratched panel after car-park contact.", "Headlight cracked by debris.",
             "EV battery housing damaged by kerb strike.", "Two-car collision at junction."]


def b(p_true, p_blank=0.0):
    r = random.random()
    if r < p_blank:
        return ""
    return "True" if random.random() < p_true else "False"


def make(i):
    ev = random.random() < 0.08
    quote = round(random.lognormvariate(6.6, 0.55))  # median ~ EUR 735, long right tail
    row = {
        "case_id": f"VOL-{i:04d}",
        "case_status": "closed" if random.random() < 0.35 else "open",
        "claim_summary": random.choice(SUMMARIES),
        "policy_active_on_incident": b(0.97, 0.01),
        "claim_type": random.choices(["motor_own_damage", "theft", "glass", ""], [0.9, 0.04, 0.05, 0.01])[0],
        "repair_type": "ev_high_voltage_battery" if ev else "standard",
        "quote_eur": "" if random.random() < 0.03 else str(quote),
        "incident_report_present": b(0.88, 0.02),
        "itemized_quote_present": b(0.85, 0.02),
        "injury_reported": b(0.05, 0.01),
        "liability_disputed": b(0.07, 0.01),
        "duplicate_flag": b(0.02, 0.01),
        "evidence_conflict": b(0.03, 0.01),
    }
    return row


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("output")
    ap.add_argument("--n", type=int, default=500)
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    random.seed(a.seed)
    with open(a.output, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        for i in range(1, a.n + 1):
            w.writerow(make(i))
    print(f"Wrote {a.n} unlabelled synthetic claims to {a.output}")
