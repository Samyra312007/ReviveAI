"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VOICE_TEMPLATES, renderTemplate, VoiceTemplate } from "@/lib/voice/templates";

const TONE_STYLES: Record<string, string> = {
  friendly: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  urgent: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  formal: "border-sky-500/30 bg-sky-500/10 text-sky-400",
};

/** Pick the best available voice for an English/Hinglish line. */
function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const preferences = ["en-IN", "hi-IN", "en-GB", "en-US"];
  for (const lang of preferences) {
    const match = voices.find((v) => v.lang.replace("_", "-") === lang);
    if (match) return match;
  }
  return voices.find((v) => v.lang.startsWith("en")) ?? voices[0] ?? null;
}

export function VoicePreview() {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(true);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSpeechSupported(false);
      return;
    }
    const synth = window.speechSynthesis;
    // Chrome loads voices asynchronously; keep the freshest list.
    const loadVoices = () => {
      voiceRef.current = pickVoice(synth.getVoices());
    };
    loadVoices();
    synth.addEventListener("voiceschanged", loadVoices);
    // Stop any audio when leaving the page.
    return () => {
      synth.removeEventListener("voiceschanged", loadVoices);
      synth.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setPlayingId(null);
  }, []);

  function togglePlay(t: VoiceTemplate) {
    if (!speechSupported) return;
    if (playingId === t.id) {
      stop();
      return;
    }
    const synth = window.speechSynthesis;
    synth.cancel(); // stop anything already speaking

    const line = renderTemplate(t, {
      name: "Ravi Kumar",
      amount: "2,499",
      merchant: "Kirana Plus",
      discount: "100",
    });
    const utterance = new SpeechSynthesisUtterance(line);
    if (voiceRef.current) utterance.voice = voiceRef.current;
    utterance.lang = voiceRef.current?.lang ?? "en-IN";
    utterance.rate = t.tone === "urgent" ? 1.1 : 0.95;
    utterance.pitch = t.tone === "friendly" ? 1.05 : 1;
    utterance.onend = () => setPlayingId((cur) => (cur === t.id ? null : cur));
    utterance.onerror = () => setPlayingId((cur) => (cur === t.id ? null : cur));

    setPlayingId(t.id);
    synth.speak(utterance);
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {!speechSupported && (
        <div className="lg:col-span-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-400">
          Your browser does not support speech synthesis, so previews cannot
          play audio. The scripts below are exactly what would be spoken.
        </div>
      )}
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
                onClick={() => togglePlay(t)}
                disabled={!speechSupported}
                className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
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
