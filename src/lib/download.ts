// File downloads for every "Export / Download CSV" button. The user is always asked:
// 1. Where the browser allows it (Chrome, Edge, top-level page): the system "Save as" dialog.
// 2. Otherwise (Firefox, Safari, or inside an editor preview frame that blocks downloads): an in-app
//    window with the file ready, a download button the user clicks directly, "Open in new tab" and
//    "Copy" as fallbacks. See DownloadPrompt.
// Optional byte-order mark so Excel opens umlauts and € correctly (not for machine-read files such as
// the judges' batch results, where it would end up in the first column name).

export interface PendingDownload {
  filename: string;
  content: string;
  type: string;
  rows?: number;
}

type Listener = (d: PendingDownload | null) => void;
const listeners = new Set<Listener>();

/** The fallback window subscribes here. */
export function onDownloadPrompt(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export const closeDownloadPrompt = () => listeners.forEach((l) => l(null));

interface SaveFilePickerWindow {
  showSaveFilePicker?: (opts: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{
    createWritable: () => Promise<{
      write: (d: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}

export type DownloadResult = "saved" | "cancelled" | "prompted";

/**
 * Ask the user to save a file. Call it straight from a click handler (no await before it):
 * the "Save as" dialog needs the click to still be fresh.
 */
export async function downloadFile(
  filename: string,
  content: string,
  opts: { bom?: boolean; type?: string; rows?: number } = {},
): Promise<DownloadResult> {
  const type = opts.type ?? "text/csv;charset=utf-8";
  const body = opts.bom && !content.startsWith("﻿") ? `﻿${content}` : content;
  const w = window as unknown as SaveFilePickerWindow;
  if (typeof w.showSaveFilePicker === "function" && !inFrame()) {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "CSV file", accept: { "text/csv": [".csv"] } }],
      });
      const out = await handle.createWritable();
      await out.write(new Blob([body], { type }));
      await out.close();
      return "saved";
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return "cancelled";
      // not allowed here: fall back to the in-app window
    }
  }
  const pending: PendingDownload = { filename, content: body, type, rows: opts.rows };
  if (listeners.size) listeners.forEach((l) => l(pending));
  else clickDownload(pending); // no window mounted (e.g. tests): plain download
  return "prompted";
}

/** A plain download through a link on the page; the file is released only after it has started. */
export function clickDownload(d: PendingDownload) {
  const url = URL.createObjectURL(new Blob([d.content], { type: d.type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = d.filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
}

/** True when the app runs inside another page (e.g. an editor preview), where downloads can be blocked. */
export const inFrame = () => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};
