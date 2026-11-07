// Display names for the raw codes that come from the claim data, policies and the database.
// Display only: decisions and stored values keep the raw codes.

export const CLAIM_TYPE_LABEL: Record<string, string> = {
  motor_own_damage: "Own damage",
  theft: "Theft",
  glass: "Glass damage",
};

export const REPAIR_TYPE_LABEL: Record<string, string> = {
  standard: "Standard repair",
  ev_high_voltage_battery: "EV high-voltage battery",
};

export const CHANNEL_LABEL: Record<string, string> = {
  phone: "Phone (voice agent)",
  online_form: "Online form",
  csv_import: "CSV import",
};

export const QUEUE_LABEL: Record<string, string> = {
  on_you: "On you",
  waiting_customer: "Waiting on customer",
  auto_processed: "Auto-processed",
  done: "Done",
};

export const SOURCE_TYPE_LABEL: Record<string, string> = {
  transcript: "Call transcript",
  form: "Online form",
  document: "Document",
  system: "System check",
  csv: "CSV import",
};

const CODE_LABEL: Record<string, string> = { ...CLAIM_TYPE_LABEL, ...REPAIR_TYPE_LABEL, ...CHANNEL_LABEL, ...QUEUE_LABEL };

const looksLikeCode = (v: string) => /^[a-z0-9]+(_[a-z0-9]+)+$/.test(v);
const sentence = (v: string) => v.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** One value as shown to a person: known codes get their name, other snake_case codes become words. */
export function valueLabel(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  if (CODE_LABEL[t]) return CODE_LABEL[t];
  return looksLikeCode(t) ? sentence(t) : v;
}

export const claimTypeLabel = (v: string) => CLAIM_TYPE_LABEL[v.trim()] ?? sentence(v.trim());
export const repairTypeLabel = (v: string) => REPAIR_TYPE_LABEL[v.trim()] ?? sentence(v.trim());
export const channelLabel = (v: string) => CHANNEL_LABEL[v] ?? sentence(v);

/** Replace raw codes inside a sentence, e.g. 'Claim type "theft" needs a person' or 'Repair: standard'. */
export function humanize(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/\bType: ([a-z_]+)/g, (_, c: string) => `Claim type: ${claimTypeLabel(c)}`)
    .replace(/\bRepair: ([a-z_]+)/g, (_, c: string) => `Repair: ${repairTypeLabel(c)}`)
    .replace(/claim_type '([^']+)'/g, (_, c: string) => `claim type "${claimTypeLabel(c)}"`)
    .replace(/repair_type '([^']+)'/g, (_, c: string) => `repair "${repairTypeLabel(c)}"`)
    .replace(/"([a-z]+(?:_[a-z0-9]+)+)"/g, (_, c: string) => `"${valueLabel(c)}"`)
    .replace(/\b(motor_own_damage|ev_high_voltage_battery|online_form|csv_import|waiting_customer|auto_processed)\b/g, (c) => CODE_LABEL[c] ?? sentence(c));
}
