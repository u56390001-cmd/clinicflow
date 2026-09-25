# INIT PROMPT — MedBook AI
## Phase 7: No-Code Website Builder (Templates, Editor, Publishing)
**Target tool:** OpenCode
**Prerequisite:** Phases 1–6 complete and verified — auth, clinic/services/availability, appointments/calendar, patients CRM, and the working public AI widget (with the recently fixed deterministic booking flow) are all working.

---

## 1. EXPERT ROLE
Continue as the Senior Full-Stack Engineer / Architect from Phases 1–6. This phase introduces a second public-facing surface (published clinic websites), so apply the same security discipline established for the widget in Phase 6 — scoped server-side access, no RLS-weakening for public reads.

## 2. OBJECTIVE
Let a doctor build and publish a real, professional clinic website with zero coding: pick a template, edit content section-by-section with a live preview, and publish it to a public, clinic-specific URL — with the AI widget (Phase 6) embedded on it.

## 3. SCOPE — what to build

### A. Required Sections (every template must support all of these)
- **Hero**: doctor/clinic name, headline, description, CTA button, hero image.
- **About**: doctor biography, clinic description, credentials.
- **Services**: automatically pulled from the clinic's **active** services (Phase 2/3 data) — not manually re-entered; this section always reflects live service data.
- **Gallery**: image upload, reordering, delete.
- **Contact**: phone, email, address, opening hours (pulled from Phase 2's `availability_rules`, not re-entered manually), booking CTA (should link to/open the AI widget or a direct booking path).

### B. Website Templates
Implement three templates: **Classic**, **Modern**, **Minimal**.
- All three must consume the **same common configuration object** — do not let templates have divergent/incompatible data shapes:
```
Website
 ├── theme        (colors, fonts, etc.)
 ├── content       (hero text, about text, contact info, etc.)
 ├── sections       (which sections are visible/ordered)
 ├── images         (gallery + hero image references)
 └── clinic         (read-only reference data: services, hours, pulled live)
```
- **Critical requirement**: switching templates must never destroy the doctor's entered content — template is purely a presentational layer over the same config object. Test this explicitly: enter content, switch template, confirm content persists and simply re-renders differently.

### C. Website Editor (`/app/website` or similar)
- Layout: **editor sidebar + live preview**, side-by-side on desktop (per PRD's exact layout: sidebar sections list on the left — Hero/About/Services/Gallery/Contact — live website preview on the right). On mobile, stack appropriately (preview and editor can't realistically sit side-by-side on a narrow screen — use a reasonable responsive pattern, e.g. tabs or a preview toggle).
- Editable fields: clinic name, headline, description, about content, services visibility (show/hide, not re-entry — content comes from Services), gallery images, contact information, theme, primary color, template selection.
- Live preview updates as the doctor edits (debounce as needed for performance, but it should feel responsive, not require an explicit "refresh preview" click).
- Autosave or explicit save — pick one and implement it properly (if autosave, debounce and show a clear "saved" indicator; if explicit save, make sure unsaved-changes are visually indicated and not silently lost on navigation).

### D. Publishing
- Each clinic has a unique slug (already established from Phase 1/2 — reuse it, don't create a second slug system).
- **Publishing states**: `draft`, `published`, `unpublished` — implement all three as real states on the `websites` table, not just a boolean.
- **Only `published` websites are publicly accessible.** A `draft` or `unpublished` site must return a graceful "not available" state at its public URL — never leak draft content publicly, and never crash/404 ungracefully.
- Public website route: build this as a distinct public, unauthenticated route (e.g. `/site/[slug]` for local dev — note the PRD's production design uses `clinic-slug.yourdomain.com` subdomain routing via middleware, which requires real DNS/domain setup not available in local dev; implement the subdomain-aware middleware structure so it's production-ready, but ensure there's also a working non-subdomain fallback path for local testing).
- The published website must embed the Phase 6 AI widget (via the JS embed or an inline equivalent) so visitors can chat/book directly from the site — reuse Phase 6's widget, don't rebuild chat UI here.

## 4. DATABASE WORK REQUIRED
Confirm/create via migration:
```
websites: id, clinic_id, slug, template, status, content_json, theme_json, published_at, created_at, updated_at
website_images: (gallery images — clinic_id/website_id, image url/path, order, created_at)
```
- RLS: owner/admin write access to `websites`/`website_images` scoped via `clinic_members`, same established pattern.
- **Public read path**: per Phase 6's precedent, do not relax RLS to allow anonymous reads — implement the public website route using a scoped, server-side service-role query (like `createWidgetClient` from Phase 6) that explicitly only returns data for websites where `status = 'published'`. Validate `slug` input strictly (Zod) before querying.
- Image storage: use Supabase Storage for gallery/hero images (confirm bucket setup, appropriate public/private access rules — hero/gallery images on a published site need to be publicly viewable, but upload/delete must remain owner/admin-only).

## 5. DEFINITION OF DONE
- [ ] All three templates implemented, all consuming the same shared config object.
- [ ] All five required sections implemented and functional in the editor and on the public site.
- [ ] Services and Contact/hours sections pull live data from Phase 2/3 — never manually duplicated/stale content.
- [ ] Switching templates preserves content (explicitly tested).
- [ ] Editor sidebar + live preview UX implemented, responsive.
- [ ] Draft/Published/Unpublished states all function correctly; only published sites are publicly reachable.
- [ ] Public site route is secure (scoped server-side access, no RLS relaxation, strict slug validation).
- [ ] AI widget successfully embedded and functional on the published site.
- [ ] Gallery image upload/reorder/delete works via Supabase Storage.
- [ ] RLS-enforced isolation verified: a user from a different clinic cannot edit or view another clinic's draft website content.

## 6. CONSTRAINTS
- Do not rebuild the AI widget chat UI — embed Phase 6's existing widget.
- Do not let Services or Contact-hours content drift out of sync with the real `services`/`availability_rules` tables — pull live, don't duplicate/store separately (except for content genuinely specific to the website, like hero headline/about text, which is website-only content).
- Do not relax RLS for the public site route — use scoped server-side access matching Phase 6's pattern.
- Do not implement billing/subscription gating on publishing — that's a later phase; publishing should just work once a clinic reaches this point.
- Keep template-switching non-destructive — this is an explicit, testable requirement, not a nice-to-have.

## 7. PROCESS
1. Confirm current state: check whether `websites`/`website_images` tables or any website-editor scaffolding already exist (the PRD notes some starter projects had placeholder template components) — report findings before writing new code.
2. Propose the shared config object schema and the editor's route/component structure before implementing.
3. Implement: migrations (websites, website_images, storage bucket) → shared config object + one working template (start with Modern or Classic) → editor UI (sidebar + live preview) wired to that template → second and third templates consuming the same config → publishing states + public route (secured) → widget embedding on the public site → gallery upload.
4. Provide a verification checklist: create website content, switch between all three templates and confirm content persists each time, publish, visit the public URL in an incognito window and confirm it loads with correct content and a working AI widget, unpublish and confirm the public URL now shows a graceful unavailable state, and confirm a second test user from a different clinic cannot access or edit this website's draft content.

Confirm your understanding and current-state findings back to me before writing code. Do not start Phase 8 (Billing/Stripe, Notifications, Analytics, or final polish) — I'll provide that init prompt once this phase is verified.
