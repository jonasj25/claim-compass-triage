import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocumentUploads } from "@/components/triage/DocumentUploads";
import { EMPTY_ANSWERS } from "@/lib/report-intake";

vi.mock("@/lib/document-scan.functions", () => ({
  scanDocument: vi.fn(async () => ({
    answers: { quote_amount: "980", quote_itemized: "yes", repair_kind: "standard" },
    findings: {
      quote_amount: { value: "980", evidence: "Total (incl. VAT) 980.00", source: "text" },
      quote_itemized: { value: "yes", evidence: "5 priced lines", source: "text" },
      repair_kind: { value: "standard", evidence: "Rear bumper cover", source: "text" },
    },
    seen: { plate: "M-JO 4821" },
    looksLike: "quote",
    method: "text",
  })),
}));

describe("document upload scanning", () => {
  it("scans a document, shows what it read and hands the answers over", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response(new Uint8Array([37, 80, 68, 70])),
    ) as typeof fetch;
    const onAdd = vi.fn();
    render(
      <DocumentUploads
        files={[]}
        onAdd={onAdd}
        onRemove={() => undefined}
        answers={{ ...EMPTY_ANSWERS, plate: "M-AN 2735" }}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: /Use demo file/ })[1]); // the repair quote
    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(onAdd.mock.calls[0][1]).toEqual({
      quote_amount: "980",
      quote_itemized: "yes",
      repair_kind: "standard",
    });
  });

  it("lists the findings and warns about a different plate", async () => {
    const { rerender } = render(
      <DocumentUploads files={[]} onAdd={() => undefined} onRemove={() => undefined} />,
    );
    globalThis.fetch = vi.fn(
      async () => new Response(new Uint8Array([37, 80, 68, 70])),
    ) as typeof fetch;
    fireEvent.click(screen.getAllByRole("button", { name: /Use demo file/ })[1]);
    const file = {
      kind: "quote" as const,
      name: "repair_quote_itemized_sample.pdf",
      type: "application/pdf",
      size: 4,
      b64: "JVBERg==",
      demo: true,
    };
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    rerender(
      <DocumentUploads
        files={[file]}
        onAdd={() => undefined}
        onRemove={() => undefined}
        answers={{ ...EMPTY_ANSWERS, plate: "M-AN 2735" }}
      />,
    );
    await waitFor(() => expect(screen.getByText("Read from the document")).toBeTruthy());
    expect(screen.getByText("Quote itemized")).toBeTruthy();
    expect(screen.getByText("It lists each item")).toBeTruthy();
    expect(screen.getByText("Bodywork, glass or mechanical parts")).toBeTruthy();
    expect(
      screen.getByText(/The plate on this document \(M-JO 4821\) is not the one you gave/),
    ).toBeTruthy();
  });
});
