import { createServerFn } from "@tanstack/react-start";

// Writes a short consultant memo about advisor results. Server-side only: the Lovable AI gateway key
// never reaches the browser. The model only explains numbers computed by the deterministic optimizer;
// it does not choose the policy. If the gateway is not configured, the page shows its built-in summary.

export interface MemoInput {
  claims: number;
  mode: "within" | "relax";
  baseline: Record<string, number | string>;
  suggestions: Record<string, Record<string, number | string | boolean>>;
  assumptions: Record<string, number>;
}

export const advisorMemo = createServerFn({ method: "POST" })
  .inputValidator((d: MemoInput) => d)
  .handler(async ({ data }): Promise<{ text: string | null; error?: string }> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { text: null, error: "AI gateway not configured (LOVABLE_API_KEY missing)" };
    const system =
      "You are a claims-operations consultant for a European motor insurer. You receive results from a deterministic policy optimizer. " +
      "Write a concise memo (max 170 words) for the policy owner: one sentence per goal (financial, customer, reviewer time) with the concrete numbers, " +
      "the main trade-off, and a clear recommendation. Never invent numbers. Say that red flags, claim types, the EV rule and document rules stay locked, " +
      "that any suggestion that raises the quote limit relaxes the written policy and needs compliance approval, and that every suggestion must be checked on Change impact before activation. Plain text, no markdown headings.";
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: system },
            { role: "user", content: JSON.stringify(data) },
          ],
          temperature: 0.2,
        }),
      });
      if (!res.ok) return { text: null, error: `AI gateway returned ${res.status}` };
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = json.choices?.[0]?.message?.content?.trim();
      return text ? { text } : { text: null, error: "Empty answer from the AI gateway" };
    } catch (e) {
      return { text: null, error: (e as Error).message };
    }
  });
