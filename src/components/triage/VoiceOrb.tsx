import { useEffect, useRef } from "react";

export type Phase = "idle" | "speaking" | "listening" | "thinking" | "ended";

/** Flowing colour orb in the spirit of ElevenLabs' voice orb, drawn on a canvas. Reacts to loudness. */
export function VoiceOrb({ phase, level }: { phase: Phase; level: () => number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const levelRef = useRef(level);
  levelRef.current = level;
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = 176;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const blobs = [
      { c: "42,78,239", r: 0.62, sx: 0.00031, sy: 0.00023, p: 0 },
      { c: "56,189,248", r: 0.55, sx: 0.00027, sy: 0.00037, p: 1.7 },
      { c: "139,92,246", r: 0.5, sx: 0.00041, sy: 0.00019, p: 3.1 },
      { c: "186,230,253", r: 0.48, sx: 0.00022, sy: 0.00033, p: 4.6 },
    ];
    let t = 0;
    let last = performance.now();
    let smooth = 0;
    let raf = 0;
    const draw = (now: number) => {
      const ph = phaseRef.current;
      const live = ph === "speaking" || ph === "listening" || ph === "thinking";
      const target = live ? Math.max(0, Math.min(1, levelRef.current() || 0)) : 0;
      smooth += (target - smooth) * 0.18;
      const speed = reduce ? 0.2 : ph === "speaking" ? 2.4 + smooth * 4 : ph === "listening" ? 1.5 + smooth * 4 : ph === "thinking" ? 1.8 : 0.6;
      t += (now - last) * speed;
      last = now;
      const R = size / 2;
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(R, R, R * (0.93 + smooth * 0.07), 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "#EEF4FF";
      ctx.fillRect(0, 0, size, size);
      ctx.filter = "blur(14px)";
      for (const b of blobs) {
        const x = R + Math.cos(t * b.sx + b.p) * R * (0.45 + smooth * 0.15);
        const y = R + Math.sin(t * b.sy + b.p * 1.3) * R * (0.45 + smooth * 0.15);
        const rad = R * b.r * (1 + smooth * 0.25);
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, `rgba(${b.c},0.95)`);
        g.addColorStop(1, `rgba(${b.c},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.filter = "none";
      const shine = ctx.createRadialGradient(R * 0.7, R * 0.55, 0, R * 0.7, R * 0.55, R);
      shine.addColorStop(0, "rgba(255,255,255,0.45)");
      shine.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = shine;
      ctx.fillRect(0, 0, size, size);
      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} aria-hidden="true" className="size-44 rounded-full" style={{ width: 176, height: 176 }} />;
}

