# MedBook AI — Landing Page Spec & Feature Blueprint

Deliverable: a **marketing landing page** for MedBook AI — the clinic
management SaaS built in this repo. This document defines what the product is,
its full feature inventory, and exactly what the landing page should show.

---

## 1. Product positioning

**One-liner**
> MedBook AI — the AI receptionist and clinic management system for independent
> doctors and small clinics. Answer every WhatsApp, book every patient, run
> your whole clinic — without hiring more staff.

**Who it's for**
- Independent / single-doctors clinics
- Polyclinics & multi-branch groups (multi-facility)
- Clinics drowning in WhatsApp messages, phone calls, and paper queues

**Core promise**
Patients get answered instantly (WhatsApp, 24/7). Staff get one dashboard for
appointments, patients, billing, prescriptions and queue. The clinic gets a
free website + online booking that fills empty slots.

**Why now (pain)**
- Front desk burned out answering "kitna fee hai?" and "doctor kab aaynge?"
- Missed calls = missed patients
- Manual billing / prescriptions = wasted doctor time
- No online presence, no online booking = empty calendar

---

## 2. Feature inventory (accurate to the product)

Grouped by module. Use these exact capabilities in the landing page's feature
sections — don't promise anything that isn't in the system.

### 2.1 AI Receptionist (WhatsApp)  — the hero feature
- Always-on WhatsApp AI receptionist that talks like your clinic (`/whatsapp`)
- Answers fees, doctor timings, services, location in natural conversation
- Books appointments directly from chat
- Escalates to a human when needed
- Engineered with concern-first behavior: 4 primary buttons, department-first
  doctor flow, single-intent fee replies, menu-dump guard (`/api/whatsapp/webhook`)
- Warm / professional tone matching the clinic's voice

### 2.2 Online Booking & Patient-facing
- Public booking page per clinic (`/book/[slug]`)
- Pre-consultation questions & intake forms
- Slot-based scheduling: per-slot patient limits, per-service slots
- Doctor availability calendar (`/availability`, `/calendar`)
- Appointment reminders (automatic, configurable)

### 2.3 Patient CRM
- Full patient profiles with medical history, past visits
- Medications, alerts, lab results, documents (with OCR intake)
- AI patient summaries (`/api/patients/[id]/ai-summary`)
- Patient ID cards with custom code format (`/settings/patient-id`)

### 2.4 Clinic Operations
- **Appointments & queue**: day view, check-in, vitals capture, TV queue display
  (`/display/queue`) for the waiting room
- **Consultation & Scribe**: consultation notes, AI scribe (transcribe →
  structure → save), prescriptions, structured medical history
- **Billing**: invoices, payments, checkout, patient billing, billing settings,
  add-ons marketplace

### 2.5 Websites & Widgets  — the growth engine
- No-code clinic website builder with editable templates (modern / minimal /
  classic) and live section editor (hero, about, services, doctors, booking,
  gallery, experience, FAQ, contact)
- Custom domains + SEO
- Embeddable AI chat widget for the website with quick actions

### 2.6 Growth & Engagement
- Growth agent: engagement automation, reminders, re-engagement campaigns
- Google OAuth growth integrations
- Engagement analytics

### 2.7 Team & Multi-branch
- Staff roles & granular permissions (owner, admin, receptionist, nurse,
  doctor, accountant…)
- Role-based access control enforced in-app AND at the database (RLS)
- Secure staff invites via cryptographic tokens, accept-and-go onboarding
- Multi-facility: single location or multi-branch organisation support
- Support tickets

### 2.8 Trust & Platform
- Multi-tenant, bank-grade row-level security — tenants cannot see each other
- Staff/support audit log (append-only)
- Fast-track onboarding: create a clinic in under 2 minutes

---

## 3. Landing page — section-by-section blueprint

Order on the page (top → bottom). Each section lists hook, content and CTA.

### 3.1 Nav
- Logo (MedBook AI) + links: Features, How it works, Pricing, FAQ
- CTA buttons: **Log in**, **Start free**

### 3.2 Hero — the 5-second pitch
- Headline (choose or rotate):
  - *"Your patients text you on WhatsApp all day. Let AI answer."*
  - *"The AI receptionist that books, bills and runs your clinic."*
- Subhead: *"MedBook AI answers your WhatsApp 24/7, books appointments, manages
  patients and billing, and builds you a free website — in minutes, not months."*
- Primary CTA: **Start free — set up in under 2 minutes**
- Secondary CTA: **See a demo** / *Watch the AI in action*
- Visual: WhatsApp chat mockup with the AI receptionist conversation + a mini
  dashboard behind it
- Trust strip: *"Built for independent doctors & small clinics"* → 3 chips
  (AI receptionist · Online booking · RLS security)

### 3.3 Problem / Social proof bar
- One line: *"Front desks are drowning. MedBook AI keeps you open 24/7."*
- Optional animated counters: messages answered, apps booked

### 3.4 Features — 6-card grid (primary lagaan)
Use these 6 tiles (each links to its live module):
1. **AI WhatsApp Receptionist** — answers fees/timings, books from chat
2. **Online Booking** — public booking page + availability + reminders
3. **Patient CRM** — histories, medications, lab results, AI summaries
4. **Queue & TV Display** — check-in, vitals, waiting-room screen
5. **Consultation & Scribe** — notes, prescriptions, AI dictation
6. **Billing & Payments** — invoices, checkout, add-ons

### 3.5 Deep-dive — AI Receptionist (big feature band, dark/teal bg)
- Headline: *"Meet your new evening shift, holiday shift, lunch shift."*
- Bullet list (copy-paste from 2.1):
  - Answers every message instantly, in your clinic's tone
  - Handles fee/timing/service questions naturally
  - Books appointments right inside the chat
  - Escalates to your team when it should
- Visual: conversation screenshot (fee question → doctor slot → booking)

### 3.6 Deep-dive — Website & Growth
- *"Your clinic online in an afternoon."* — no-code website builder, free
  booking page, embeddable widget, SEO + custom domains
- Visual: builder UI or a finished template site

### 3.7 How it works (3 steps)
1. **Create your clinic** — under 2 minutes, invite your team
2. **Connect WhatsApp & sync your services** — AI starts answering
3. **Share your booking link** — patients book, you focus on care

### 3.8 Pricing section
- Simple gate cards (placeholder rates; keep consistent with `/app/admin/billing`)
  - Solo Starter / Clinic Growth / Multi-branch
- Every plan: AI receptionist, booking, CRM, website widget
- CTA: **Start free**

### 3.9 Security & trust band
- *"Bank-grade by default."* — Multi-tenant RLS, immutable audit log, secure
  invites. Reassure clinic owners their patient data is isolated.

### 3.10 FAQ (accordion)
- "Will the AI mess up my appointments?" → locked to your availability, human
  escalation
- "Do patients need an app?" → WhatsApp/website only
- "Is my data safe?" → per-clinic RLS isolation
- "Can I run multiple branches?" → yes, multi-branch orgs
- "How fast to set up?" → under 2 minutes

### 3.11 Final CTA + Footer
- *"Answer them before they ask."* → **Start free**
- Footer: product links, privacy/terms placeholders, copyright MedBook AI

---

## 4. Copy tone guidelines
- Short, confident, patient-first ("Your patients", not "Users")
- No unexplained jargon: avoid "SaaS", "multi-tenant" in body copy (keep in
  trust/security section where it reassures)
- Numeric proof wherever true ("under 2 minutes", "24/7")
- Roman-Urdu-friendly? No — landing page is English-first (users are clinic
  owners in Pakistan + international); WhatsApp tone already localizable

---

## 5. Visual direction (reuse existing brand tokens)
- **Teal primary** `#0D9488`, teal-light `#14B8A6`, teal tint `#F0FDFA`
- Secondary slate `#0F172A`; app background `#F9FAFB`; white surfaces
- Font: Plus Jakarta Sans (headings) + Inter (body) — `font-sans`
- Rounded cards (12px), pill buttons, `shadow-card`
- Signature element: **WhatsApp chat mockup** in teal, floating AI reply chips
- One accent color only — teal. No gradients unless used for the hero wash.

## 6. Implementation notes (for the build step)
- Route: `app/page.tsx` (public `/`) — currently redirects; replace with the
  marketing page (keep `/login`, `/signup`, `/app/*` untouched)
- Reuse design tokens from `tailwind.config.ts`; no new arbitrary colors
- Components: build `components/landing/*` (Nav, Hero, ChatMockup, Features,
  HowItWorks, Pricing, Faq, CtaBanner, Footer) — no shadcn init needed
- Copy living in the components (or a `lib/content/` file) so a rewrite doesn't
  touch layout
- Keep framework default — Next.js app router, React 19, Tailwind, Lucide icons
- Lighthouse targets: LCP < 2.5s (static page, no heavy JS), 100 accessibility

---

## 7. Acceptance checklist
- [ ] Hero headline + WhatsApp chat mockup visible above the fold
- [ ] All 6 core features shown, each linking to a real module
- [ ] AI Receptionist deep-dive band with honest capability list
- [ ] 3-step how-it-works
- [ ] Pricing, security trust band, FAQ, footer CTA
- [ ] Matches brand tokens; Lighthouse LCP/accessibility goals met
- [ ] `/login`, `/signup`, app routes unaffected