// Registered customers: who may report a claim through Mia, our voice assistant.
// Pure matching rules only. The customer list itself lives in customers.server.ts and is only read on the server,
// so the browser never sees who is registered.

export interface Customer {
  name: string;
  email: string;
  /** Licence plate of the customer's insured car */
  plate: string;
}

const DIGITS: Record<string, string> = {
  zero: "0",
  oh: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  null: "0",
  eins: "1",
  zwei: "2",
  drei: "3",
  vier: "4",
  fünf: "5",
  sechs: "6",
  sieben: "7",
  acht: "8",
  neun: "9",
};

/** Turns an email as typed or spoken ("John one two three at gmail dot com") into a comparable address. */
export function normalizeEmail(raw: string): string {
  let t = String(raw ?? "")
    .trim()
    .toLowerCase();
  t = t.replace(/\s+(at|ät)\s+/g, "@").replace(/\s+(dot|punkt)\s+/g, ".");
  t = t.replace(
    /\b(zero|oh|one|two|three|four|five|six|seven|eight|nine|null|eins|zwei|drei|vier|fünf|sechs|sieben|acht|neun)\b/g,
    (w) => DIGITS[w] ?? w,
  );
  return t.replace(/\s+/g, "").replace(/[.,!?]+$/, "");
}

const fold = (s: string) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^(my name is|i'm|i am|it's|this is|ich heiße|mein name ist)\s+/, "")
    .replace(/[^a-z\s'-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

/** Same person by name: the full registered name, or its first name ("John" matches "John" and "John Smith"). */
export function sameName(registered: string, said: string): boolean {
  const r = fold(registered);
  const s = fold(said);
  if (!r.length || !s.length) return false;
  if (r.join(" ") === s.join(" ")) return true;
  return r.length === 1 ? s[0] === r[0] : r.every((w, i) => s[i] === w);
}

/** The registered customer with this name AND this email, or null. Both must belong to the same customer. */
export function findCustomer(
  list: readonly Customer[],
  name: string,
  email: string,
): Customer | null {
  const e = normalizeEmail(email);
  if (!e || !name.trim()) return null;
  return list.find((c) => normalizeEmail(c.email) === e && sameName(c.name, name)) ?? null;
}
