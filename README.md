# MedBook AI

Multi-tenant healthcare SaaS: clinic management, an AI booking receptionist, and
a no-code clinic website builder — for independent doctors and small clinics.

**Phase 1** delivers the foundation: Next.js 15 app, Supabase multi-tenant
database with Row-Level Security, full authentication, and clinic onboarding
(create clinic → become owner via `clinic_members`).

## Stack

- **Framework** — Next.js 15 (App Router), React 19, TypeScript (strict)
- **Styling** — Tailwind CSS 3.4 + semantic design tokens, shadcn-style Radix primitives
- **Backend** — Supabase (Postgres, Auth, Row-Level Security)
- **Validation** — Zod (all server actions)

## Prerequisites

- Node.js 20+
- npm
- A Supabase project — [hosted](https://supabase.com/dashboard) or local via the
  [Supabase CLI](https://supabase.com/docs/guides/cli)

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env.local
#   - NEXT_PUBLIC_SUPABASE_URL  → your project URL (https://xxx.supabase.co)
#   - NEXT_PUBLIC_SUPABASE_ANON_KEY → your project's anon (publishable) key
#   - NEXT_PUBLIC_SITE_URL      → http://localhost:3000 for local dev

# 3. Apply the database migrations
#    (hosted project)
supabase link --project-ref <your-project-ref>
supabase db push

#    (or local stack)
supabase start
supabase db reset
```

### Supabase Auth settings (dashboard)

| Setting | Value |
| --- | --- |
| Auth → URL Configuration → Site URL | `http://localhost:3000` |
| Auth → URL Configuration → Redirect URLs | add `http://localhost:3000/auth/callback` |
| Auth → Sign In / Up → **Confirm email** | **ON** to exercise the email-verification flow |

> Hosted projects can send auth emails out of the box. Local (`supabase start`)
> projects need SMTP configured in `supabase/config.toml` before reset/verify
> emails are delivered.

## Run

```bash
npm run dev        # http://localhost:3000
```

### Verify the Phase 1 flows

1. **Sign up** → `/signup` → you land on `/verify` ("check your inbox").
2. **Confirm email** → click the link → `/auth/callback` exchanges the token →
   redirect to the protected `/app/dashboard`.
3. **Create a clinic** → dashboard shows the empty state → `/app/clinic/new` →
   a `clinics` row + an `owner` `clinic_members` row are created.
4. **Log out** → header "Sign out" → `/login`. Visiting `/app/dashboard` while
   logged out redirects to `/login`.
5. **Password reset** → `/forgot-password` → email link → set new password →
   back to `/login`.

## RLS isolation check

Tenant isolation is enforced by the database, not by the app. Quick manual test:

1. In browser **A**, sign up and create clinic A. In browser **B** (different
   profile/incognito), sign up and create clinic B.
2. In browser A's DevTools, attempt to read or write clinic B's row (e.g. via a
   raw Supabase client or by guessing clinic B's id). It must return **zero
   rows** and reject the write — RLS filters it before the app ever sees it.

`PHASE_1_NOTES.md` contains the full SQL-based verification script (runnable in
the Supabase SQL editor) that simulates each user and asserts cross-tenant reads
and writes are impossible.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run lint` | ESLint |

## Project structure

```
app/                    # App Router routes ((auth) group, (app) group, callback)
components/
  ui/                   # base primitives: Button, Input, Card, Label, Badge, Alert, Skeleton, Spinner
  auth/                 # signup/login/forgot/reset forms, password input, submit button
  app/                  # app shell: header, dashboard, empty state
  clinic/               # clinic creation form
lib/
  supabase/             # server / browser / middleware clients
  actions/              # server actions (auth, clinic) — "use server"
  validation/           # Zod schemas
  constants.ts          # routes, slug rules, reserved slugs
supabase/migrations/    # versioned SQL: schema + RLS policies
types/                  # hand-written DB + shared types
middleware.ts           # session middleware (route protection)
```

## Design tokens

All UI uses the MedBook AI token set in `tailwind.config.ts` — teal primary
(`#0D9488`), slate secondary (`#0F172A`), light app background, status colors,
Inter font, and the radius scale (cards `12px`, controls `8px`, pills `9999px`).
No arbitrary colors/spacing/radii are used elsewhere.

## License

Private — © MedBook AI.
