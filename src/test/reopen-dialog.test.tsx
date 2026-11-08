import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReopenDialog } from "@/components/triage/ReopenDialog";
import { BATCH_POLICY_V2 } from "@/lib/batch";
import type { Claim } from "@/lib/triage";

const reopenCase = vi.fn(async () => ({
  decision: { recommendation: "human_review" },
  assignee: "Mara Klein",
}));
vi.mock("@/lib/reopen", async (orig) => ({
  ...(await orig<typeof import("@/lib/reopen")>()),
  reopenCase: (...a: unknown[]) => reopenCase(...(a as [])),
}));

const claim: Claim = {
  case_id: "CLM-9",
  case_status: "closed",
  policy_active_on_incident: true,
  claim_type: "motor_own_damage",
  repair_type: "standard",
  quote_eur: 1300,
  incident_report_present: true,
  itemized_quote_present: true,
  injury_reported: false,
  liability_disputed: false,
  duplicate_flag: false,
  evidence_conflict: false,
};

describe("Reopen dialog", () => {
  it("shows the decision under the active policy and reopens with the chosen reason", async () => {
    const onDone = vi.fn();
    render(
      <ReopenDialog
        caseId="CLM-9"
        claim={claim}
        policy={BATCH_POLICY_V2}
        current="routine_processing"
        actor="Mara Klein"
        previousAssignee="Lea Hoffmann"
        onDone={onDone}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Reopen claim/ }));
    expect(screen.getByText(/changed, flagged for recheck/)).toBeTruthy();
    const save = screen.getAllByRole("button", { name: /Reopen claim/ }).at(-1)!;
    expect((save as HTMLButtonElement).disabled).toBe(true); // a reason is required
    fireEvent.click(screen.getByRole("radio", { name: "More damage found (supplement)" }));
    fireEvent.click(screen.getByRole("button", { name: "Lea Hoffmann" }));
    fireEvent.click(save);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(reopenCase).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        caseId: "CLM-9",
        reason: "additional_damage",
        assign: "previous",
        actor: "Mara Klein",
      }),
    );
  });
});
