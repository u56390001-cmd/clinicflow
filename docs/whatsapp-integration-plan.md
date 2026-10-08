# WhatsApp Integration Plan — Manual Token (Meta Cloud API)

> Purpose: connect, test, and run the **WhatsApp AI agent** and **appointment reminders**
> on the local dev environment and on the deployed Vercel app — **without** Facebook
> Embedded Signup. A manual access token is pasted into the system and stored server-side.

---

## 1. Overview — what is already built

| Piece | Location | Status |
|---|---|---|
| Cloud API send client (text / buttons / list) | `lib/whatsapp/client.ts` (`graph.facebook.com/v23.0/{phone_number_id}/messages`) | Done |
| Inbound webhook (GET verify + HMAC-signed POST) | `app/api/whatsapp/webhook/route.ts` | Done |
| AI agent adapter (receptionist turn, patient matching, interactive taps) | `lib/whatsapp/adapter.ts` | Done |
| Credential storage (`config` + zero-RLS `secrets`) | `clinic_whatsapp_config`, `clinic_whatsapp_secrets` (migration 0019) | Done |
| Reminders sender (cron) | `app/api/cron/appointment-reminders/route.ts` | Done (GET gap → §5) |
| Notification dispatcher | `lib/notifications/index.ts` → `lib/notifications/whatsapp.ts` | Done |
| Embedded Signup (NOT used in this plan) | `lib/actions/whatsapp.ts`, `components/ai/whatsapp-connect-card.tsx` | Existing, optional |

**Because the webhook, agent, and reminders already exist, no new webhook or AI reply
code is needed.** The only missing pieces are: (a) a manual way to paste/store the token,
(b) serverless/Vercel wiring, (c) a step-by-step runbook.

---

## 2. Prerequisites checklist

- [ ] Meta developer account — <https://developers.facebook.com>
- [ ] A Meta **Business** app with the **WhatsApp** product added (test number)
- [ ] Tunnel tool for local webhook: `ngrok` **or** `cloudflared`
- [ ] Your own phone with WhatsApp (as test recipient)
- [ ] Vercel project (already deployed)
- [ ] Supabase project (migrations 0062 / 0063 applied)

---

## 3. Meta setup (manual token)

### Step 1 — Create the app
1. <https://developers.facebook.com> → **Create App**
2. App type **Business**, name e.g. `MedBookAI-Test` → create
3. Dashboard → **WhatsApp** → **Setup** (adds the product)

### Step 2 — Copy test credentials (API Setup page)
1. **Temporary Access Token** (expires ~24h; refresh from the same page, or use a
   System User permanent token via Business Settings for a long-lived one)
2. **Phone Number ID** (the test number's `phone_number_id`)
3. **To (recipient)** → add your personal WhatsApp number → OTP verify
   (up to 5 recipient numbers allowed in test mode)

> Save these three values — they go into the manual-connect form (Step 6) / Vercel env.

### Step 3 — Configure the webhook
1. **WhatsApp → Configuration → Webhook → Edit**
   - **Callback URL**: `https://<YOUR_HOST>/api/whatsapp/webhook`
     - Local: `https://<tunnel-id>.ngrok.app/api/whatsapp/webhook` (or cloudflared URL)
     - Vercel: `https://<your-app>.vercel.app/api/whatsapp/webhook`
   - **Verify Token**: the value of `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (see §4)
2. **Verify and Save**
3. **Webhook Fields** → subscribe to **`messages`** (and `message_template_status_update` if desired)

---

## 4. Environment variables

### Local — `.env.local` (already present in this repo)

| Variable | Value / notes | Used by |
|---|---|---|
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | any secret string you choose | webhook GET handshake (`route.ts:37`) |
| `META_APP_SECRET` | your Meta app secret | POST signature HMAC (`route.ts:54`) |
| `NEXT_PUBLIC_META_APP_ID` | optional if skipping Embedded Signup | Embedded Signup only |
| `NEXT_PUBLIC_META_CONFIG_ID` | optional if skipping Embedded Signup | Embedded Signup only |
| `META_GRAPH_VERSION` | optional, default `v23.0` | Graph calls |
| `WHATSAPP_RATE_LIMIT_PER_MINUTE` | optional, default 10 | inbound rate limit |
| `CRON_SECRET` | random ≥16 chars | reminders cron auth |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | already set | AI agent reply |
| `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_URL` | already set | service-role client |

> Note: the **business access token** and **phone_number_id** are **not** env vars —
> they are stored per-clinic in `clinic_whatsapp_config` + `clinic_whatsapp_secrets`
> via the manual-connect action (Step 6).

### Vercel — Settings → Environment Variables

Add at minimum:

```
WHATSAPP_WEBHOOK_VERIFY_TOKEN = <same string as local>
META_APP_SECRET                = <Meta app secret>        # REQUIRED in production
CRON_SECRET                    = <random ≥16 chars>
META_GRAPH_VERSION             = v23.0                    # optional
WHATSAPP_RATE_LIMIT_PER_MINUTE = 10                       # optional
NEXT_PUBLIC_META_APP_ID        = <app id>                 # only if Embedded Signup enabled
NEXT_PUBLIC_META_CONFIG_ID     = <config id>              # only if Embedded Signup enabled
```

Plus the existing app vars (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`GEMINI_API_KEY`, …). **Redeploy** after saving so new variables are live.

> `META_APP_SECRET` is mandatory on Vercel: in production the webhook rejects unsigned
> requests (`route.ts:59` returns 401 if the signature check fails or no secret is set).

---

## 5. Code changes for serverless (Vercel)

1. **Manual-connect action** — `lib/actions/whatsapp.ts`
   `connectWhatsappManualAction(phoneNumberId, wabaId, displayPhone, accessToken)`:
   owner/admin gated, validates numeric ids + token, upserts `clinic_whatsapp_config`
   (status `connected`) and `clinic_whatsapp_secrets.access_token` through the
   service-role client. Token never crosses back to the browser.

2. **Manual-connect UI** — `components/ai/whatsapp-connect-card.tsx`
   Collapsible “Manual test setup (advanced)” section when not connected and `canWrite`:
   4 fields + Save → action → `router.refresh()`. Embedded Signup button stays primary.

3. **Cron GET handler** — `app/api/cron/appointment-reminders/route.ts`
   Vercel Cron issues **HTTP GET**, route currently exports only `POST` (`route.ts:88`).
   Extract body into a shared `run()` and export both `POST` and `GET` with the same
   `isAuthorized` check (`route.ts:80`).

4. **Serverless-safe webhook processing** — `app/api/whatsapp/webhook/route.ts`
   `void handleInboundMessage(...)` (`route.ts:81`) can be cut off on serverless right
   after the 200. Wrap in `after()` from `next/server` so the function stays alive to
   finish the AI turn + reply.

5. **`vercel.json`** — add `crons` block (hourly, e.g. `0 * * * *`) pointing at
   `/api/cron/appointment-reminders`. Vercel auto-sends
   `Authorization: Bearer <CRON_SECRET>`. Cron runs **only on production** deployments.

6. **`.env.example`** — document `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET`,
   `META_GRAPH_VERSION`, `CRON_SECRET` (currently absent).

---

## 6. Local test flow

1. `npm run dev` → `http://localhost:3000`
2. Start tunnel: `ngrok http 3000` **or** `cloudflared tunnel --url http://localhost:3000`
3. In Meta console set Callback URL to the tunnel URL (Step 3)
4. In the app: **AI Settings → WhatsApp → Manual test setup** → paste
   `phone_number_id` + `access_token` (+ waba id / display phone) → Save
   (or run the manual-connect action with your test values)
5. Toggle **WhatsApp channel** enabled in AI settings
6. **Inbound / AI agent test**: send *“Hi”* from your phone to the Meta test number
   → webhook fires → AI agent replies (check `console.log`/terminal)
7. **Reminders test** (patient with `notification_preference` = whatsapp/both and a
   stored `whatsapp_number`, appointment inside the reminder window):

   ```powershell
   curl.exe -X POST http://localhost:3000/api/cron/appointment-reminders `
     -H "Authorization: Bearer $env:CRON_SECRET"
   ```

   (or `-H "x-cron-secret: $env:CRON_SECRET"`)

---

## 7. Vercel test flow

1. Set env vars (§4) → **Redeploy**
2. Set Meta Callback URL to the Vercel URL → Verify
3. Confirm `vercel.json` `crons` block exists → deploy creates the cron
4. In **Vercel → Logs**, trigger the cron or wait for the schedule; confirm a
   `200` from `/api/cron/appointment-reminders`
5. Manual trigger:

   ```powershell
   curl.exe -X GET https://<your-app>.vercel.app/api/cron/appointment-reminders `
     -H "Authorization: Bearer <CRON_SECRET>"
   ```

6. From your phone: message the test number → confirm AI reply in Vercel Logs
7. Confirm a reminder reaches your own WhatsApp number (add it as a patient with
   preference `whatsapp` and an appointment inside the window)

---

## 8. Important caveat — 24-hour window & message templates

Free-form WhatsApp messages can only be sent while Meta’s **24-hour customer-service
window** is open (patient messaged first). Otherwise an **approved message template**
is required (`lib/notifications/whatsapp.ts`).

- **Testing**: messaging the test number first opens the window → reminders free-form
  pass. Test mode also allows sending to your verified recipient numbers.
- **Production**: reminders to cold numbers need a Meta-approved template — future work,
  not covered by this plan.

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Webhook 403 on verify | `WHATSAPP_WEBHOOK_VERIFY_TOKEN` mismatch | Same string in Meta console and env |
| Webhook 401 on POST | `META_APP_SECRET` missing/wrong in prod | Set `META_APP_SECRET` and redeploy |
| No AI reply on Vercel | fire-and-forget killed after 200 | `after()` wrapper (§5.4) |
| Cron 401 | wrong/missing `CRON_SECRET` | Match header and env; Vercel auto-sends it |
| Cron 405 | GET handler missing (prod) | Add `GET` export (§5.3) |
| `clinic not connected` | `phone_number_id` not in `clinic_whatsapp_config` / status ≠ `connected` | Re-run manual connect |
| Nothing processed inbound | `clinic_ai_settings.whatsapp_enabled` false | Enable WhatsApp channel in AI Settings |
| Reminder not sent | patient preference not `whatsapp`/`both`, or `whatsapp_number` null, or outside window | Fix patient record; see §8 |
| Token rejected by Graph | temporary token expired | Refresh token (Meta API Setup) or use System User permanent token |

---

## 10. Summary of steps (quick list)

1. Meta: create Business app → add WhatsApp → copy test token + phone_number_id → add your number
2. Set env vars locally and on Vercel (§4) → redeploy
3. Set webhook Callback URL + Verify Token in Meta → subscribe `messages`
4. Code changes (§5): manual connect, cron GET, webhook `after()`, `vercel.json` crons
5. Paste credentials via manual-connect UI
6. Test inbound AI reply + reminders locally (tunnel) then on Vercel (logs)
