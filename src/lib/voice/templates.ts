export interface VoiceTemplate {
  id: string;
  scenario: string;
  language: "en" | "hi" | "hinglish";
  template: string;
  tone: "friendly" | "urgent" | "formal";
  duration_seconds: number;
}

export const VOICE_TEMPLATES: VoiceTemplate[] = [
  {
    id: "VT-01",
    scenario: "Payment retry (insufficient funds)",
    language: "hinglish",
    tone: "friendly",
    duration_seconds: 22,
    template:
      "Namaste {name}. Aapka ₹{amount} ka payment {merchant} ke saath fail ho gaya hai. Chinta mat karein, humne aapke liye ek naya payment link bheja hai. Link par click karein aur 2 minute mein payment complete karein. Dhanyavaad!",
  },
  {
    id: "VT-02",
    scenario: "Payment retry (network timeout)",
    language: "hinglish",
    tone: "urgent",
    duration_seconds: 14,
    template:
      "Namaste {name}. Technical issue ki wajah se aapka payment ruk gaya tha. Humne dobara link bheja hai, ab try karein, 1 minute mein ho jayega!",
  },
  {
    id: "VT-03",
    scenario: "Checkout abandonment (< 5 min)",
    language: "hinglish",
    tone: "friendly",
    duration_seconds: 12,
    template:
      "Namaste {name}! Aapka cart abhi bhi {merchant} par hai. Checkout complete karein aur ₹{discount} ka instant discount paayein!",
  },
  {
    id: "VT-04",
    scenario: "Checkout abandonment (5–30 min)",
    language: "hinglish",
    tone: "urgent",
    duration_seconds: 11,
    template:
      "Namaste {name}. Aapka order abhi bhi wait kar raha hai. Limited stock hai, jaldi se order place karein!",
  },
  {
    id: "VT-05",
    scenario: "Subscription retry",
    language: "hinglish",
    tone: "formal",
    duration_seconds: 16,
    template:
      "Namaste {name}. Aapka subscription renew karne ka time aa gaya hai. Payment method update karein taaki service continue rahe.",
  },
  {
    id: "VT-06",
    scenario: "Invoice overdue (7 days)",
    language: "hinglish",
    tone: "friendly",
    duration_seconds: 18,
    template:
      "Namaste {name}. Aapka ₹{amount} ka invoice {merchant} ke liye 7 din se pending hai. Payment kar dein ya humse baat karein, hum aapki madad karenge.",
  },
  {
    id: "VT-07",
    scenario: "Invoice overdue (14+ days)",
    language: "hinglish",
    tone: "formal",
    duration_seconds: 15,
    template:
      "Namaste {name}. ₹{amount} ka payment 14 din se pending hai. Kripya jald se jald payment karein. Agar koi problem hai toh humse sampark karein.",
  },
  {
    id: "VT-08",
    scenario: "Promise fulfilled",
    language: "hinglish",
    tone: "friendly",
    duration_seconds: 13,
    template:
      "Namaste {name}! Aapne jo ₹{amount} ka promise kiya tha, wo payment mil gayi hai. Shukriya! Aapka trust hamari sabse badi taakat hai.",
  },
];

export function renderTemplate(
  t: VoiceTemplate,
  vars: Record<string, string>,
): string {
  return t.template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}
