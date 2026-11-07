// Remembers the list a reviewer opened a case from, so the case page can step
// through it (previous / next) like a task queue. Per browser tab only.
const KEY = "triage.caseNav";

export interface CaseNav {
  label: string;
  ids: string[];
}

export function saveCaseNav(label: string, ids: string[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ label, ids } satisfies CaseNav));
  } catch {
    // storage unavailable (private mode, preview): navigation falls back to the default queue
  }
}

export function readCaseNav(): CaseNav | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as CaseNav;
    return Array.isArray(v?.ids) ? v : null;
  } catch {
    return null;
  }
}
