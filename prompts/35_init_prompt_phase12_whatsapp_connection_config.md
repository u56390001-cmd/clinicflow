# INIT PROMPT — MedBook AI
## Phase 12: WhatsApp Business Connection + AI Agent Configuration
**Reference documents:** Base PRD (Phases 1–9) + `PRD-Feature-Expansion-v1.1.md` Section 4.3
**Target tool:** OpenCode
**Prerequisite:** Phase 10 (Doctor Management) and Phase 11 (Notification Dispatcher) complete and verified.

---

## 0. IMPORTANT — READ BEFORE STARTING
This phase builds the **connection and configuration layer only** — no live WhatsApp conversations/booking yet (that's Phase 13). By the end of this phase, a clinic can connect their WhatsApp Business number and configure how their AI agent should behave on it, but messages aren't actually being processed yet.
- Do **not** rebuild Phase 5's `AIProvider`/`GeminiProvider` abstraction — extend `clinic_ai_settings` and the system-prompt-building logic, don't create a parallel AI config system for WhatsApp.
- Do **not** implement the inbound webhook/message-handling logic yet — that's Phase 13's scope.
- Before writing any code: inspect the current `clinic_ai_settings` table and AI Settings page (Phase 5, plus the FAQ enhancement and any `response_tone`-adjacent fields already added) — report exactly what exists so this phase extends it correctly instead of duplicating.

## 1. EXPERT ROLE
Continue as the Senior Full-Stack Engineer / Architect from Phases 1–11. This phase introduces the first external, credentialed third-party integration since Gemini/Resend/Stripe — apply the same secrets discipline (server-side only, never client-exposed) established in those phases.

## 2. OBJECTIVE
Let a clinic connect their WhatsApp Business number to MedBook AI, and configure their AI agent's WhatsApp-specific behavior (enable/disable, tone, agent tier, greeting style) — extending the existing AI Settings page and `clinic_ai_settings` model, not building a separate system.

## 3. SCOPE

### A. WhatsApp Business Connection
- Add a `clinic_whatsapp_config` table:
  ```
  clinic_whatsapp_config: id, clinic_id, whatsapp_business_account_id, phone_number_id,
                           access_token (encrypted/server-only), display_phone_number,
                           connection_status ('not_connected' | 'connected' | 'error'),
                           connected_at, created_at, updated_at
  ```
- Implement the connection flow using Meta's WhatsApp Cloud API / Embedded Signup (research the current, correct integration approach via Meta's official developer documentation rather than assuming a remembered flow, since Meta's onboarding UX changes over time) — the clinic owner clicks "Connect WhatsApp" in AI Settings, completes Meta's auth flow, and the resulting credentials are stored server-side only.
- `access_token` must never be sent to or stored in any client-side code/state — treat with the same discipline as the Gemini API key and Supabase service role key.
- Connection status UI: clearly show connected/not-connected/error state, with a "Disconnect" action that clears stored credentials.
- RLS: `clinic_whatsapp_config` scoped via `clinic_members`, owner/admin write access only.

### B. AI Agent Configuration (extend existing AI Settings page — do not create a second settings page)
Add to the existing `/app/ai-settings` page (alongside welcome message, FAQs, tone if already present from earlier work):
1. **WhatsApp enable/disable toggle** — separate and independent from the existing internal-AI-enabled toggle (Phase 5) and public-widget-activated toggle (Phase 6). A clinic might enable AI on the widget but not WhatsApp, or vice versa — verify all three toggles are independently stored and independently checked wherever each channel decides whether to respond.
2. **Response tone selector**: `professional` / `friendly` / `empathetic`. Add `response_tone` to `clinic_ai_settings` as a **shared, cross-channel field** (per the addendum's explicit guidance) — this must affect the system prompt used by the internal test chat, the public widget, and (in Phase 13) WhatsApp uniformly, so the clinic has one consistent AI personality rather than a fragmented one per channel. Confirm the shared system-prompt-building function (from Phase 5/6) is updated to incorporate this field — if tone wasn't previously a configurable dimension, this may require a small addition to that function, not a new one.
3. **Agent tier**: `chatbot` (simple menu-based) vs `ai_agent` (natural language, current default behavior). Per the addendum: treat `ai_agent` as the default and primary supported mode; implement the `chatbot` option as a stored preference field only in this phase — do not build actual menu-based conversational logic yet unless explicitly requested, since MedBook AI's existing natural-language AI (Phase 5/6) is the intended default experience. Flag back to me if a real menu-based fallback mode should be built now vs. deferred.
4. **Greeting style**: `custom_template` (reuses the existing Phase 5 welcome-message field) vs `ai_generated` (model drafts its own greeting each time, per Phase 5's existing prompting patterns) — store as a field, wire the actual generation behavior into the shared system-prompt logic.

### C. What NOT to build in this phase (explicit boundary)
- No per-clinic "bring your own LLM API key" selector (Gemini/OpenAI/Anthropic) — MedBook AI's `AIProvider` abstraction (Phase 5) already made this an app-level, not per-clinic, decision. This is out of scope unless explicitly requested later.
- No inbound message webhook, no actual WhatsApp conversation handling, no booking logic on WhatsApp — Phase 13.
- No human takeover/chat inbox UI — Phase 14.

## 4. DATABASE WORK REQUIRED
- Migration: `clinic_whatsapp_config` (RLS scoped via `clinic_members`).
- Migration: add `whatsapp_enabled` (boolean), `response_tone` (enum), `agent_tier` (enum), `greeting_style` (enum) to `clinic_ai_settings` — nullable/sensible-defaulted so existing clinics from Phases 5–9 are unaffected (`whatsapp_enabled` defaults `false`, `response_tone` defaults to whatever the current implicit tone is, e.g. `professional`, `agent_tier` defaults `ai_agent`, `greeting_style` defaults `custom_template` matching current behavior).

## 5. SECURITY REQUIREMENTS
- WhatsApp access tokens encrypted at rest if the existing infrastructure supports it (check what pattern, if any, is already used for other sensitive credentials in this project; if none exists yet, at minimum ensure the token is never exposed via any API response to the client and is stored in a column not selectable by anon/authenticated roles — service-role-only access).
- Confirm the Meta Embedded Signup flow's callback/redirect handling validates state correctly (standard OAuth-style CSRF protection) — research Meta's current documented requirements for this rather than assuming.
- RLS on `clinic_whatsapp_config` — cross-tenant isolation verified.

## 6. DEFINITION OF DONE
- [ ] Clinic can connect a WhatsApp Business number via Meta's Embedded Signup flow; credentials stored server-side only.
- [ ] Connection status UI accurately reflects connected/not-connected/error, with working disconnect.
- [ ] WhatsApp enable/disable toggle is independent from widget/internal-AI toggles and correctly stored.
- [ ] `response_tone`, `agent_tier`, `greeting_style` fields added, editable in AI Settings, and `response_tone` verified to affect the shared system-prompt logic across at least the internal test chat and widget (WhatsApp itself isn't live yet, but the field must already be "real," not decorative).
- [ ] Cross-tenant isolation verified for `clinic_whatsapp_config`.
- [ ] No secrets exposed client-side.

## 7. CONSTRAINTS
- Do not implement message handling/booking logic — connection and configuration only.
- Do not create a second, parallel AI-configuration system — extend `clinic_ai_settings` and the existing AI Settings page.
- Do not disable RLS.
- Research Meta's current WhatsApp Cloud API / Embedded Signup documentation directly rather than relying on possibly-outdated remembered details, since this integration's exact steps and requirements can change.

## 8. PROCESS
1. Inspect current `clinic_ai_settings` schema and AI Settings page; report findings before implementing.
2. Research and confirm the current correct Meta WhatsApp Cloud API connection flow before building it.
3. Propose the exact migration set and settings UI layout before implementing.
4. Implement: migrations → WhatsApp connection flow (OAuth/Embedded Signup + credential storage) → connection status UI → AI agent configuration fields (tone, tier, greeting) wired into the shared system-prompt function → verify tone affects existing channels (widget/internal chat).
5. Provide a verification checklist: connect a test WhatsApp Business number (or confirm the flow reaches Meta's auth screen correctly if a real business number isn't available for testing yet — flag this limitation clearly), disconnect and reconnect, toggle WhatsApp enable/disable and confirm it's stored independently of other toggles, change response tone and confirm the internal test chat's responses reflect the new tone, confirm cross-tenant isolation.

Confirm your understanding, the `clinic_ai_settings` audit, and your Meta API research findings back to me before writing code. Do not start Phase 13 (WhatsApp Conversational Booking) — I'll provide that init prompt once this phase is verified.
