import { createServerFn } from "@tanstack/react-start";

// ElevenLabs voice for the customer claim conversation (/report).
// The API key lives only on the server (Lovable secret ELEVENLABS_API_KEY) and is never sent to the browser.
// Without a key the page falls back to the browser's own speech features.

const API = "https://api.elevenlabs.io/v1";
const key = () => process.env["ELEVENLABS_API_KEY"] || "";
// Runtime-neutral base64 helpers (no Node Buffer, so this also works on edge runtimes)
const toBase64 = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const voiceId = () => process.env["ELEVENLABS_VOICE_ID"] || "EXAVITQu4vr4xnSDxMaL"; // premade voice "Sarah"

export const voiceStatus = createServerFn({ method: "GET" }).handler(async () => ({ elevenlabs: !!key() }));

/** Text -> speech. Returns base64 MP3, or null when ElevenLabs is not configured or fails. */
export const speakText = createServerFn({ method: "POST" })
  .inputValidator((d: { text: string }) => ({ text: String(d?.text ?? "").slice(0, 600) }))
  .handler(async ({ data }): Promise<{ audio: string | null }> => {
    if (!key() || !data.text.trim()) return { audio: null };
    for (const model_id of ["eleven_flash_v2_5", "eleven_multilingual_v2"]) {
      const res = await fetch(`${API}/text-to-speech/${voiceId()}?output_format=mp3_44100_64`, {
        method: "POST",
        headers: { "xi-api-key": key(), "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({ text: data.text, model_id, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
      });
      if (res.ok) return { audio: toBase64(await res.arrayBuffer()) };
      if (res.status === 401 || res.status === 403) break;
    }
    return { audio: null };
  });

/** Speech -> text. Takes a base64 audio recording from the browser. */
export const transcribeAudio = createServerFn({ method: "POST" })
  .inputValidator((d: { audio: string; mime: string; lang?: string }) => {
    const audio = String(d?.audio ?? "");
    if (audio.length > 12_000_000) throw new Error("Recording too long");
    return { audio, mime: String(d?.mime || "audio/webm"), lang: d?.lang === "de" ? "de" : "en" };
  })
  .handler(async ({ data }): Promise<{ text: string | null }> => {
    if (!key() || !data.audio) return { text: null };
    const bytes = fromBase64(data.audio);
    for (const model_id of ["scribe_v2", "scribe_v1"]) {
      const form = new FormData();
      form.append("model_id", model_id);
      form.append("language_code", data.lang === "de" ? "deu" : "eng");
      form.append("file", new Blob([bytes], { type: data.mime }), `answer.${data.mime.includes("mp4") ? "mp4" : "webm"}`);
      const res = await fetch(`${API}/speech-to-text`, { method: "POST", headers: { "xi-api-key": key() }, body: form });
      if (res.ok) {
        const json = (await res.json()) as { text?: string };
        return { text: (json.text ?? "").trim() };
      }
      if (res.status === 401 || res.status === 403) break;
    }
    return { text: null };
  });
