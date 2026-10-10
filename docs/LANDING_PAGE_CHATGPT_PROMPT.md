# MedBook AI — ChatGPT Plus Prompt Pack (Landing Page)

Yeh document ChatGPT Plus ko paste karne ke liye ready hai. Is mein 2 prompts
hain — **Prompt A** (HTML mockup) aur **Prompt B** (copy deck). Dono se jo output
mile wo mujhe (opencode) de do, main repo mein port kar dunga.

---

## How to use this file

1. ChatGPT Plus mein **Prompt A** paste karo → mil jaye ga `landing-mockup.html`
   → ye mujhe do.
2. ChatGPT Plus mein **Prompt B** paste karo → mil jaye ga copy deck (markdown)
   → ye bhi mujhe do.
3. Folder mein files dena zyada behtar hai (agar available ho) warna copy-paste
   bhi chalega — sirf poora single HTML + poora copy deck hona chahiye.

---

## Prompt A — Single-file HTML mockup

```
You are a senior product designer. Build ONE single, self-contained HTML file
named landing-mockup.html for a clinic management SaaS called "MedBook AI".
It must open directly in a browser by double-clicking the file.

RULES:
- Use ONLY Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
- NO React, NO build tools, NO separate CSS/JS files, NO external images.
- For any icon, use inline SVG or Lucide via <script src="https://unpkg.com/lucide@latest"></script>.
- Single main.css inline <style> block is allowed for custom touches.
- Make it PREMIUM and distinctive — not a generic Bootstrap-looking SaaS page.

BRAND (exact colors, no deviation):
- Primary teal: #0D9488
- Teal light: #14B8A6
- Teal tint bg: #F0FDFA
- Teal tint border: #99F6E4
- Secondary slate: #0F172A
- App background: #F9FAFB
- Cards: white #FFF
- Text: primary #0F172A, secondary #475569
- Font: Plus Jakarta Sans for headings, Inter for body. Use Google Fonts links.
- Radius: cards 12px, controls 8px, pill buttons 9999px.

CONTENT SECTIONS — include ALL of these in this exact order:
1. Sticky nav — logo "MedBook AI", links (Features, How it works, Pricing, FAQ)
   and two buttons: "Log in" (ghost) and "Start free" (teal solid).
2. HERO — the strongest part of the page.
   - Headline options (pick the best): 
     a) "Your patients text you on WhatsApp all day. Let AI answer."
     b) "The AI receptionist that books, bills and runs your clinic."
   - Subhead: "MedBook AI answers your WhatsApp 24/7, books appointments,
     manages patients and billing, and builds you a free clinic website —
     in minutes, not months."
   - Two CTAs: "Start free — set up in under 2 minutes" (teal solid) and
     "See the AI in action" (ghost with play icon).
   - Right-side signature visual: a WhatsApp-style chat mockup card (phone-like
     panel) showing the AI receptionist conversation:
       Patient: "Salam doctor, fee kitni hai?"
       AI: "Gulberg branch — new patient fee Rs 2,000. Dr. Ahmed ka slot
       kal 5:00 PM khali hai. Book kar du?"
       Patient: "Ji, book kar do"
       AI: "Done ✓ Aapko confirmation message aa gaya hai."
   - Behind the mockup, a soft teal blob/gradient wash. Add a small floating
     badge like "Answers in <5s".
3. SOCIAL PROOF STRIP — one line "Built for independent doctors & small
   clinics" + 3 chips: "AI WhatsApp Receptionist" · "Online booking" · "Bank-grade
   data security".
4. FEATURES — 6-card grid (3 cols on desktop). Each card = icon + title + one
   line blurbs:
   - AI WhatsApp Receptionist — "Answers fees, timings & services 24/7 and books
     appointments inside the chat."
   - Online Booking — "A public booking page with real-time doctor availability
     and automatic reminders."
   - Patient CRM — "Full histories, medications, lab results and AI summaries in
     one place."
   - Queue & TV Display — "Check-in, vitals capture and a live waiting-room TV
     queue screen."
   - Consultation & Scribe — "Consultation notes, prescriptions and AI dictation
     that types while you talk."
   - Billing & Payments — "Invoices, checkout and payments without spreadsheet
     chaos."
5. AI RECEPTIONIST DEEP-DIVE — full-width band on dark slate (#0F172A) with
   teal accents. Left: headline "Meet your new evening shift, holiday shift,
   lunch shift." + bullets:
   - Answers every message instantly, in your clinic's own tone
   - Handles fee, timing and service questions naturally
   - Books appointments right inside the chat
   - Escalates to your team when it should
   - Right: a larger conversation screenshot panel (reuse/extend the WhatsApp
     mockup style).
6. WEBSITE & GROWTH — light section: "Your clinic online in an afternoon."
   Bullets: no-code clinic website builder, free booking page, embeddable AI
   chat widget, custom domain + SEO.
7. HOW IT WORKS — 3 steps with small numbered circles:
   1. Create your clinic — under 2 minutes, invite your team
   2. Connect WhatsApp & sync your services — AI starts answering
   3. Share your booking link — patients book, you focus on care
8. PRICING — 3 cards:
   - Solo (e.g. Rs 1,500/mo) — 1 doctor, WhatsApp AI, online booking, clinic
     website
   - Clinic Growth (e.g. Rs 4,500/mo) — everything in Solo + multi-doctors,
     billing, queue/TV display, pCRM — mark with "Most popular"
   - Multi-branch (e.g. Rs 12,000/mo) — everything + multiple locations,
     custom domains, priority support
   Each with a teal "Start free" button.
9. SECURITY BAND — "Bank-grade by default." Text: strict per-clinic data
   isolation, an immutable staff audit log, and secure team invites. Add a
   shield icon.
10. FAQ — accordion (click to expand), 5 items:
    - "Will the AI mess up my appointments?" → Locked to your live availability;
      it escalates to your team and you always approve bookings.
    - "Do patients need an app?" → No — patients use WhatsApp and your website.
    - "Is my patient data safe?" → Yes. Every clinic gets its own isolated data
      boundary (row-level security) and actions are audited.
    - "Can I run multiple branches?" → Yes — the Multi-branch plan covers
      multiple locations under one organization.
    - "How fast is setup?" → Under 2 minutes to create your clinic; AI starts
      answering after you connect WhatsApp and add services.
11. FINAL CTA — teal section: "Answer them before they ask." → button "Start
    free".
12. FOOTER — 3 columns of links (Product: Features, Pricing, FAQ; Company:
    About, Contact, Support; Legal: Privacy, Terms) + "© 2026 MedBook AI".

DESIGN NOTES:
- The WhatsApp chat mockup and the AI Receptionist band are the two signature
  moments — invest visual effort there.
- Use only teal as the accent. No rainbow gradients.
- Hero, AI band and final CTA should feel cohesive.
- Output ONLY the complete HTML file wrapped in a code block, nothing else.
```

---

## Prompt B — Copy deck (markdown)

```
Write a complete marketing copy deck in markdown for the MedBook AI landing
page. Tone: short, confident, patient-first ("your patients", not "users").
Do NOT use the word "SaaS". Deliver these, in order:

1. HERO — 3 headline options (short, punchy, benefit-led) + 1 recommended
   subhead.
2. SOCIAL PROOF STRIP — one line + 3 two-word chips.
3. FEATURES — 6 cards: title + one-line blurb each (AI WhatsApp Receptionist,
   Online Booking, Patient CRM, Queue & TV Display, Consultation & Scribe,
   Billing & Payments).
4. AI RECEPTIONIST DEEP-DIVE — headline + 4 bullets (instant answers, natural
   fee/timing/service replies, in-chat booking, human escalation).
5. WEBSITE & GROWTH — headline + 4 bullets.
6. HOW IT WORKS — 3 steps (2-3 words title + one line each).
7. PRICING — 3 tiers (Solo, Clinic Growth, Multi-branch): name, price in PKR
   with /mo, 4-6 features each, one tagline each.
8. FAQ — 5 questions + 2-sentence answers (from the list in my brief).
9. FINAL CTA — headline + button text.
10. FOOTER LINKS — 3 groups × 4 links with placeholder names.

Format: clean markdown with ## section headers and bullet lists only.
```

---

## What comes back to me (opencode)

| Mil jaye | Format | Zaroorat |
| --- | --- | --- |
| `landing-mockup.html` | 1 single HTML file | Isko main `app/page.tsx` + `components/landing/*` mein port karta hoon |
| Copy deck | 1 markdown file | Iska content main components mein use karta hoon |

### Jo ChatGPT se NA mangwain
- ❌ Next.js / React components — mujhe raw HTML chahiye taake main repo ke
  design tokens ke sath convert kar sakun
- ❌ Images/photos — no external images; placeholders hi banein
- ❌ Multiple CSS files ya build setup — sirf ek HTML file
- ❌ Animation frameworks — nahi; light CSS hover/transition kaafi hai

### Port karte waqt main kaise handle karta hoon
- HTML ko `app/page.tsx` (server component, public `/`) mein render karta hoon
- Wahi brand tokens (`tailwind.config.ts`) re-use hoti hain, koi naya color nahi
- Chat mockup / accordion agar interactive hue to client components
  (`components/landing/*.tsx`) banaunga
- `npm run build` + lint green rakhunga