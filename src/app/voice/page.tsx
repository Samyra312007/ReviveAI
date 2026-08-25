import { PageHeader } from "@/components/ui";
import { VoicePreview } from "@/components/voice-preview";

export const dynamic = "force-dynamic";

export default function VoicePage() {
  return (
    <>
      <PageHeader
        title="Voice Notifications — Hinglish Recovery"
        description="Personalized Hinglish voice nudges for customers who respond better to voice than text. Template library below; automated delivery ships with the voice module."
      />
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Why Hinglish</div>
          <p className="mt-2 text-sm text-zinc-300">
            40%+ of Indian customers prefer Hindi or Hinglish. Voice notes get 3× higher open rates than SMS.
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Delivery</div>
          <p className="mt-2 text-sm text-zinc-300">
            WhatsApp voice note first, SMS fallback — always gated by voice opt-in and 09:00–20:00 IST rules.
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Guardrails</div>
          <p className="mt-2 text-sm text-zinc-300">
            Max 1 voice per customer per week, max 3 attempts before switching to text (rules F1–F4).
          </p>
        </div>
      </div>
      <h2 className="mb-4 text-lg font-semibold">Template Library (VT-01 – VT-08)</h2>
      <VoicePreview />
    </>
  );
}
