"""Regression tests. Run: python tests/test_engine.py   (or: pytest tests/)"""
import csv
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "engine"))
from triage import OUTPUT_COLUMNS, decide, evaluate, load_policy, normalise, run  # noqa: E402

P1 = load_policy(os.path.join(ROOT, "policies", "v1.json"))
P2 = load_policy(os.path.join(ROOT, "policies", "v2.json"))


def base(**kw):
    row = {"case_id": "T", "case_status": "open", "claim_summary": "", "policy_active_on_incident": "True",
           "claim_type": "motor_own_damage", "repair_type": "standard", "quote_eur": "500",
           "incident_report_present": "True", "itemized_quote_present": "True", "injury_reported": "False",
           "liability_disputed": "False", "duplicate_flag": "False", "evidence_conflict": "False"}
    row.update(kw)
    return normalise(row)


def test_labelled_dev_cases_v1():
    rows = list(csv.DictReader(open(os.path.join(ROOT, "data", "dev_cases.csv"), encoding="utf-8-sig")))
    bad = [(r["case_id"], decide(normalise(r), P1)[0], r["expected_v1"]) for r in rows
           if decide(normalise(r), P1)[0] != r["expected_v1"]]
    assert not bad, bad


def test_hand_labelled_edge_cases_v1():
    rows = list(csv.DictReader(open(os.path.join(ROOT, "data", "synthetic_edge_cases.csv"), encoding="utf-8-sig")))
    bad = [(r["case_id"], decide(normalise(r), P1)[0], r["expected_v1"], r["label_reason"]) for r in rows
           if decide(normalise(r), P1)[0] != r["expected_v1"]]
    assert not bad, bad


def test_boundary_is_strictly_greater():
    assert decide(base(quote_eur="1500"), P1)[0] == "routine_processing"
    assert decide(base(quote_eur="1500.01"), P1)[0] == "human_review"


def test_blank_is_never_guessed():
    for f in ["injury_reported", "duplicate_flag", "policy_active_on_incident", "claim_type",
              "quote_eur", "incident_report_present", "itemized_quote_present"]:
        assert decide(base(**{f: ""}), P1)[0] == "request_information", f


def test_known_trigger_beats_blank():
    assert decide(base(incident_report_present="", injury_reported="True"), P1)[0] == "human_review"
    assert decide(base(quote_eur="", liability_disputed="True"), P1)[0] == "human_review"


def test_human_review_beats_missing_document():
    assert decide(base(incident_report_present="False", injury_reported="True"), P1)[0] == "human_review"


def test_closed_cases_are_frozen():
    r = evaluate(base(case_status="closed", quote_eur="1350"), P1, P2)
    assert r["recommendation_v2"] == r["recommendation_v1"] and r["needs_recheck"] is False


def test_quote_parsing_matches_typescript():
    from triage import parse_num
    assert parse_num("€1,500.50") == 1500.5
    for bad in ["", "n/a", "nan", "inf", "1_500", "unreadable", "12abc"]:
        assert parse_num(bad) is None, bad


def test_golden_file_is_up_to_date():
    """data/golden/decisions.json feeds the TypeScript parity test; it must match this engine."""
    import json
    from export_golden import GOLDEN, build
    with open(GOLDEN, encoding="utf-8") as f:
        assert json.load(f) == build(), "stale golden file: run python engine/export_golden.py"


def test_batch_output_format(tmp_path=None):
    out = os.path.join(ROOT, "output", "test_results.csv")
    run(os.path.join(ROOT, "data", "practice_cases.csv"), out,
        os.path.join(ROOT, "policies", "v1.json"), os.path.join(ROOT, "policies", "v2.json"))
    header = next(csv.reader(open(out, encoding="utf-8")))
    assert header == OUTPUT_COLUMNS


if __name__ == "__main__":
    tests = [(n, f) for n, f in globals().items() if n.startswith("test_")]
    for n, f in tests:
        f()
        print("ok  ", n)
    print(f"{len(tests)} tests passed")
