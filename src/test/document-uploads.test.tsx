import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Route as ReportRoute } from "@/routes/report";

vi.mock("@tanstack/react-router", async (orig) => {
  const mod = await orig<typeof import("@tanstack/react-router")>();
  return { ...mod, Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> };
});
vi.mock("@/lib/voice.functions", () => ({
  voiceStatus: async () => ({ elevenlabs: false }),
  speakText: async () => ({ audio: null }),
  transcribeAudio: async () => ({ text: null }),
}));
vi.mock("@/lib/report.functions", () => ({ submitClaimReport: vi.fn(), addClaimInfo: vi.fn() }));
vi.mock("@/lib/document-scan.functions", () => ({
  scanDocument: vi.fn(async () => ({
    answers: { quote_amount: "980", quote_itemized: "yes", repair_kind: "standard" },
    findings: {},
    seen: {},
    looksLike: "quote",
    method: "text",
  })),
}));

const Page = ReportRoute.options.component as React.ComponentType;
Element.prototype.scrollTo = () => undefined; // not in jsdom

describe("uploaded documents are scanned", () => {
  it("fills in what the repair quote says and shows it under the file", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response(new Uint8Array([37, 80, 68, 70])),
    ) as typeof fetch;
    render(<Page />);
    fireEvent.click(screen.getByRole("button", { name: /form|type|write/i }));
    const demo = await screen.findAllByRole("button", { name: /Use demo file/ });
    fireEvent.click(demo[1]); // the repair quote
    await waitFor(() => expect(screen.getByText(/Repair quote: €980/)).toBeTruthy());
    expect(screen.getByText(/Quote itemized: It lists each item/)).toBeTruthy();
  });
});
