import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadFile } from "@/lib/download";

// jsdom can't read a Blob back as text, so record what goes into it
const written: string[] = [];
class RecordingBlob extends Blob {
  constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
    super(parts, opts);
    written.push(parts.map(String).join(""));
  }
}

describe("CSV download", () => {
  const RealBlob = globalThis.Blob;
  beforeEach(() => {
    written.length = 0;
    globalThis.Blob = RecordingBlob as typeof Blob;
  });
  afterEach(() => {
    vi.useRealTimers();
    globalThis.Blob = RealBlob;
  });

  it("clicks a link that is on the page, and releases the file only later", () => {
    vi.useFakeTimers();
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn(
      (b: Blob) => (blobs.push(b), "blob:test"),
    ) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    let clicked: HTMLAnchorElement | null = null;
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked = this;
      expect(document.body.contains(this)).toBe(true); // attached when clicked
    });

    downloadFile("triage-results.csv", "case_id\nCLM-1", { bom: true });
    expect(click).toHaveBeenCalledOnce();
    expect(clicked!.download).toBe("triage-results.csv");
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(written[0].charCodeAt(0)).toBe(0xfeff); // Excel-friendly
    vi.advanceTimersByTime(30_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
    expect(document.body.contains(clicked!)).toBe(false);
    click.mockRestore();
  });

  it("leaves machine-read files (batch results) without the byte-order mark", () => {
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn(
      (b: Blob) => (blobs.push(b), "blob:x"),
    ) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    downloadFile("results.csv", "case_id,recommendation_v1");
    expect(written[0]).toBe("case_id,recommendation_v1");
    click.mockRestore();
  });
});
