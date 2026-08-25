"use client";

import { useState } from "react";
import { VOICE_TEMPLATES, renderTemplate } from "@/lib/voice/templates";

const TONE_STYLES: Record<string, string> = {
  friendly: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  urgent: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  formal: "border-sky-500/30 bg-sky-500/10 text-sky-400",
};

export function VoicePreview() {
  const [playingId, setPlayingId] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {VOICE_TEMPLATES.map((t) => (
        <div
          key={t.id}
          className={`rounded-xl border p-5 transition ${
            playingId === t.id
              ? "border-emerald-500/50 bg-zinc-900"
              : "border-zinc-800 bg-zinc-900/60"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-zinc-500">{t.id}</span>
            <span className={`rounded-full border px-2 py-0.5 text-xs capitalize ${TONE_STYLES[t.tone]}`}>
              {t.tone}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-zinc-200">{t.scenario}</p>
          <p className="mt-3 text-sm leading-relaxed text-zinc-300" lang="hi-Latn">
            “{renderTemplate(t, {
              name: "Ravi Kumar",
              amount: "2,499",
              merchant: "Kirana Plus",
              discount: "100",
            })}”
          </p>
          <div className="mt-4 flex items-center justify-between border-t border-zinc-800 pt-3">
            <div className="flex items-center gap-1.5" aria-hidden>
              {[8, 14, 6, 16, 10, 18, 9, 13, 5, 15, 11, 7].map((h, i) => (
                <span
                  key={i}
                  className={`w-1 rounded-full ${playingId === t.id ? "animate-pulse bg-emerald-500" : "bg-zinc-700"}`}
                  style={{ height: `${h}px`, animationDelay: `${i * 60}ms` }}
                />
              ))}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs tabular-nums text-zinc-500">
                ~{t.duration_seconds}s · hinglish
              </span>
              <button
                onClick={() => setPlayingId(playingId === t.id ? null : t.id)}
                className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/25"
              >
                {playingId === t.id ? "■ Stop" : "▶ Preview"}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
