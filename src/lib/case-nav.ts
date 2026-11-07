// Remembers the list a reviewer opened a case from, so the case page can step
// through it (previous / next) like a task queue. Per browser tab only.
const KEY = "triage.caseNav";

export interface CaseNav {
  label: string;
  ids: string[];
  labelsById?: Record<string, string>;
}

export function saveCaseNav(label: string, ids: string[], labelsById?: Record<string, string>) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ label, ids, labelsById } satisfies CaseNav));
  } catch {
    // storage unavailable (private mode, preview): navigation falls back to the default queue
  }
}

export function readCaseNav(): CaseNav | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as CaseNav;
    if (!Array.isArray(v?.ids)) return null;
    // The existing detail page reads this helper again on each case navigation.
    // Resolve the current group here without changing that page or its Next-case flow.
    const caseId = decodeURIComponent(window.location.pathname.split("/").pop() ?? "");
    const currentLabel = v.labelsById?.[caseId];
    return currentLabel ? { ...v, label: currentLabel } : v;
  } catch {
    return null;
  }
}
