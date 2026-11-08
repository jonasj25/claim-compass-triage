import { useEffect, useMemo, useState } from "react";
import { Copy, Download, ExternalLink, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import {
  closeDownloadPrompt,
  inFrame,
  onDownloadPrompt,
  type PendingDownload,
} from "@/lib/download";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// The "your file is ready" window, used when the browser's own "Save as" dialog isn't available.
// The download button is a real link the user clicks, which browsers accept even where scripted
// downloads are blocked. Mounted once in the root layout so every page can use it.

export function DownloadPrompt() {
  const [file, setFile] = useState<PendingDownload | null>(null);
  useEffect(() => onDownloadPrompt(setFile), []);

  const url = useMemo(
    () => (file ? URL.createObjectURL(new Blob([file.content], { type: file.type })) : null),
    [file],
  );
  useEffect(
    () => () => {
      if (url) window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    [url],
  );

  const size = file ? new Blob([file.content]).size : 0;
  const framed = typeof window !== "undefined" && inFrame();

  const copy = async () => {
    if (!file) return;
    try {
      await navigator.clipboard.writeText(file.content.replace(/^﻿/, ""));
      toast("Copied – paste it into Excel or a text file");
    } catch {
      toast("Copying isn't allowed here – use Download or Open in new tab");
    }
  };

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && closeDownloadPrompt()}>
      <DialogContent className="max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Your file is ready</DialogTitle>
          <DialogDescription>
            {framed
              ? "This preview may block downloads. If nothing is saved, use Open in new tab."
              : "Click Download to save it."}
          </DialogDescription>
        </DialogHeader>
        {file && (
          <div className="flex items-center gap-3 rounded-[10px] bg-surface-2 px-4 py-3 ring-1 ring-line">
            <FileSpreadsheet className="size-5 shrink-0 text-link" />
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-medium">{file.filename}</p>
              <p className="text-[12px] text-text-2">
                {file.rows !== undefined ? `${file.rows.toLocaleString("en-US")} rows · ` : ""}
                {size < 1024
                  ? `${size} B`
                  : `${Math.round(size / 1024).toLocaleString("en-US")} KB`}
              </p>
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => void copy()}>
              <Copy className="size-4" /> Copy
            </Button>
            {url && (
              <Button variant="ghost" size="sm" asChild>
                <a href={url} target="_blank" rel="noopener">
                  <ExternalLink className="size-4" /> Open in new tab
                </a>
              </Button>
            )}
          </div>
          {url && file && (
            <Button asChild>
              <a
                href={url}
                download={file.filename}
                onClick={() => window.setTimeout(closeDownloadPrompt, 300)}
              >
                <Download className="size-4" /> Download
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
