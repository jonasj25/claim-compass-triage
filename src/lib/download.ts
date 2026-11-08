// Reliable file download from the browser, shared by every "Export / Download CSV" button.
// - The link is added to the page before clicking (Firefox and Safari ignore clicks on detached links).
// - The file URL is released only after the download has started (releasing it at once can cancel it).
// - Optional byte-order mark so Excel opens umlauts and € correctly (not for machine-read files such as
//   the judges' batch results, where it would end up in the first column name).

export function downloadFile(
  filename: string,
  content: string,
  opts: { bom?: boolean; type?: string } = {},
) {
  const type = opts.type ?? "text/csv;charset=utf-8";
  const body = opts.bom && !content.startsWith("﻿") ? `﻿${content}` : content;
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 30_000);
}

/** True when the app runs inside another page (e.g. an editor preview), where downloads can be blocked. */
export const inFrame = () => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};
