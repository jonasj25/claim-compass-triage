import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DownloadPrompt } from "@/components/triage/DownloadPrompt";
import { clickDownload, downloadFile } from "@/lib/download";

// jsdom can't read a Blob back as text, so record what goes into it
const written: string[] = [];
class RecordingBlob extends Blob {
  constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
    super(parts, opts);
    written.push(parts.map(String).join(""));
  }
}
const RealBlob = globalThis.Blob;

beforeEach(() => {
  written.length = 0;
  globalThis.Blob = RecordingBlob as typeof Blob;
  URL.createObjectURL = vi.fn(() => "blob:test") as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  globalThis.Blob = RealBlob;
  delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
});

describe("CSV download asks the user", () => {
  it("opens the browser's Save as dialog where it is available", async () => {
    const write = vi.fn(async () => undefined);
    const picker = vi.fn(async () => ({
      createWritable: async () => ({ write, close: async () => undefined }),
    }));
    (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = picker;
    const r = await downloadFile("triage-results.csv", "case_id\nCLM-1", { bom: true });
    expect(r).toBe("saved");
    expect(picker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: "triage-results.csv" }),
    );
    expect(written[0].charCodeAt(0)).toBe(0xfeff); // Excel-friendly
  });

  it("does nothing more when the user cancels the dialog", async () => {
    (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = vi.fn(async () => {
      throw new DOMException("cancelled", "AbortError");
    });
    expect(await downloadFile("x.csv", "a")).toBe("cancelled");
  });

  it("otherwise shows the 'file is ready' window with a real download link", async () => {
    render(<DownloadPrompt />);
    let r = "";
    await act(async () => {
      r = await downloadFile("audit-log.csv", "case_id\nCLM-1", { rows: 1 });
    });
    expect(r).toBe("prompted");
    expect(screen.getByText("Your file is ready")).toBeTruthy();
    expect(screen.getByText("audit-log.csv")).toBeTruthy();
    const link = screen.getByRole("link", { name: /Download/ }) as HTMLAnchorElement;
    expect(link.getAttribute("download")).toBe("audit-log.csv");
    expect(screen.getByRole("link", { name: /Open in new tab/ })).toBeTruthy();
  });

  it("leaves machine-read files (batch results) without the byte-order mark", async () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    clickDownload({
      filename: "results.csv",
      content: "case_id,recommendation_v1",
      type: "text/csv",
    });
    expect(written[0]).toBe("case_id,recommendation_v1");
  });

  it("a plain download clicks a link on the page and releases the file later", () => {
    vi.useFakeTimers();
    let attached = false;
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      attached = document.body.contains(this);
    });
    clickDownload({ filename: "r.csv", content: "a", type: "text/csv" });
    expect(click).toHaveBeenCalledOnce();
    expect(attached).toBe(true);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });
});
