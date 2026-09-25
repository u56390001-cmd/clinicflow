# WhatsApp Embedded Signup Integration — Status Report

**Generated:** 2026-08-27
**Project:** MedBook AI

---

## 1. Frontend SDK & UI

### Status: **COMPLETED**

| Item | Status | Details |
|------|--------|---------|
| Facebook JS SDK loader | Done | `whatsapp-connect-card.tsx:40-53` — dynamically injects `https://connect.facebook.net/en_US/sdk.js` |
| `window.FB.init()` with App ID + Config ID | Done | `whatsapp-connect-card.tsx:114` — uses `NEXT_PUBLIC_META_APP_ID` and `NEXT_PUBLIC_META_CONFIG_ID` |
| "Connect WhatsApp" button | Done | `whatsapp-connect-card.tsx:206-211` — opens Meta Embedded Signup popup |
| `FB.login()` with `config_id` + `response_type: "code"` | Done | `whatsapp-connect-card.tsx:140-148` — triggers the Embedded Signup flow |
| `window.message` listener for WABA/phone ids | Done | `whatsapp-connect-card.tsx:118-136` — captures `WA_EMBEDDED_SIGNUP` events with `waba_id` + `phone_number_id` |
| Status badge (Connected / Error / Not Connected) | Done | `whatsapp-connect-card.tsx:171-182` |
| Disconnect button | Done | `whatsapp-connect-card.tsx:159-169` — calls `disconnectWhatsappAction` |
| UI integrated in AI Settings | Done | `components/ai/ai-settings-section.tsx` renders `WhatsappConnectCard` |

---

## 2. ES Response Code Capture

### Status: **COMPLETED**

| Item | Status | Details |
|------|--------|---------|
| Code captured from `FB.login` callback | Done | `whatsapp-connect-card.tsx:141` — `response.authResponse.code` |
| WABA ID + Phone Number ID captured from message event | Done | `whatsapp-connect-card.tsx:126-131` — from `WA_EMBEDDED_SIGNUP` postMessage |
| `tryComplete()` fires when both code + ids are available | Done | `whatsapp-connect-card.tsx:80-97` — calls `completeWhatsappSignupAction` server action |
| Code validation (regex) | Done | `lib/actions/whatsapp.ts:93-98` — strict regex: `^[A-Za-z0-9._-]{8,512}$` |

---

## 3. Backend Token Exchange

### Status: **COMPLETED**

| Item | Status | Details |
|------|--------|---------|
| Server action `completeWhatsappSignupAction` | Done | `lib/actions/whatsapp.ts:81-221` |
| Code → Token exchange via Graph API | Done | `lib/actions/whatsapp.ts:127-136` — `GET /oauth/access_token?client_id=...&client_secret=...&code=...` |
| Display phone number lookup | Done | `lib/actions/whatsapp.ts:152-161` — `GET /v23.0/{phoneNumberId}?fields=display_phone_number` |
| Webhook subscription | Done | `lib/actions/whatsapp.ts:165-174` — `POST /v23.0/{wabaId}/subscribed_apps` |
| Owner/admin role verification | Done | `lib/actions/whatsapp.ts:106-112` — `canWriteClinic(access.role)` |
| Error state marking on failed exchange | Done | `lib/actions/whatsapp.ts:139-148` — marks `connection_status: "error"` |

---

## 4. Database Storage

### Status: **COMPLETED**

| Item | Status | Details |
|------|--------|---------|
| `clinic_whatsapp_config` table | Done | `migration 0019` — stores `whatsapp_business_account_id`, `phone_number_id`, `display_phone_number`, `connection_status`, `connected_at` |
| `clinic_whatsapp_secrets` table | Done | `migration 0019` — stores `access_token` (RLS enabled, ZERO policies — service-role only) |
| RLS policies on `clinic_whatsapp_config` | Done | Member read, admin insert/update/delete |
| No RLS policies on `clinic_whatsapp_secrets` | Done | Intentionally zero — anon/authenticated can never read tokens |
| `clinic_ai_settings.whatsapp_enabled` column | Done | Default `false` — independent channel toggle |
| Foreign key: `clinic_whatsapp_secrets.config_id` → `clinic_whatsapp_config.id` | Done | Cascades on delete |
| `updated_at` triggers | Done | Both tables have `handle_updated_at()` triggers |

---

## 5. Webhook & Messaging (Phase 13)

### Status: **COMPLETED**

| Item | Status | Details |
|------|--------|---------|
| Webhook GET handshake | Done | `app/api/whatsapp/webhook/route.ts:31-50` — verifies `hub.verify_token` |
| Webhook POST — HMAC signature verification | Done | `route.ts:52-69` — `X-Hub-Signature-256` with `META_APP_SECRET` |
| Webhook POST — inbound message parsing | Done | `route.ts:78` — `parseWebhookMessages(rawBody)` |
| Webhook POST — rate limiting | Done | `route.ts:91-101` — per-sender rate limit |
| Outbound sending client | Done | `lib/whatsapp/client.ts` — `sendWhatsappText`, `sendWhatsappList`, `sendWhatsappButtons` |
| Credential resolution (service-role) | Done | `lib/whatsapp/client.ts:36-67` — reads token from `clinic_whatsapp_secrets` |

---

## 6. Blocked / Required Items

### **Environment Variables — ALL MISSING from `.env.local`**

The following variables are **not set** in your `.env.local`. The Connect button will show "signup isn't configured" until these are added:

| Variable | Scope | What to do |
|----------|-------|------------|
| `NEXT_PUBLIC_META_APP_ID` | Browser-safe | Your Meta app ID from [developers.facebook.com](https://developers.facebook.com) |
| `NEXT_PUBLIC_META_CONFIG_ID` | Browser-safe | Facebook Login for Business configuration ID (from "WhatsApp Embedded Signup Configuration With 60 Expiration Token" template) |
| `META_APP_SECRET` | Server-only | Your Meta app secret — used for code→token exchange AND webhook HMAC verification |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Server-only | Any random string you invent — put the same value in Meta App dashboard webhook subscription settings |
| `CRON_SECRET` | Server-only | Shared secret for `POST /api/cron/appointment-reminders` |
| `META_GRAPH_VERSION` | Server-only (optional) | Defaults to `v23.0` — override only if Meta ships a newer version |

### **Meta App Dashboard Configuration Required**

| Setting | Where | Value |
|---------|-------|-------|
| App Type | App Settings > Basic | Business (Tech Provider) |
| Permissions | App Review > Permissions | `whatsapp_business_management` + `whatsapp_business_messaging` (Advanced access) |
| Facebook Login Config | Facebook Login > Settings | Create from "WhatsApp Embedded Signup Configuration With 60 Expiration Token" template |
| Allowed Domains | Facebook Login > Settings > Valid OAuth Redirect URIs | Your deployment domain (e.g., `app.yourdomain.com`) |
| Webhook URL | WhatsApp > Configuration > Webhook | `https://<your-domain>/api/whatsapp/webhook` |
| Webhook Verify Token | WhatsApp > Configuration > Webhook | Must match `WHATSAPP_WEBHOOK_VERIFY_TOKEN` env var |
| Webhook Subscribe | WhatsApp > Configuration > Webhook | Subscribe to `messages` and `message_deliveries` events |

---

## 7. Checklist Summary

### **Completed**
- [x] Facebook JavaScript SDK integration (dynamic load, `FB.init`, `FB.login`)
- [x] "Connect WhatsApp" button in AI Settings UI
- [x] Embedded Signup popup with `config_id` and `response_type: "code"`
- [x] Temporary ES Response Code capture in `FB.login` callback
- [x] WABA ID + Phone Number ID capture via `WA_EMBEDDED_SIGNUP` message event
- [x] Server action: code → 60-day permanent access token exchange
- [x] Display phone number lookup
- [x] Webhook subscription to WABA
- [x] `clinic_whatsapp_config` table with RLS (member read, admin write)
- [x] `clinic_whatsapp_secrets` table (service-role only, zero RLS policies)
- [x] `clinic_ai_settings.whatsapp_enabled` toggle
- [x] Owner/admin role verification on connect/disconnect
- [x] Error state handling on failed token exchange
- [x] Webhook GET handshake + POST HMAC verification
- [x] Outbound message sending (text, list, buttons)
- [x] Disconnect action (clears config + deletes token)

### **In Progress**
- (none currently)

### **Pending / Blocked**
- [ ] **You need to provide:** `NEXT_PUBLIC_META_APP_ID`
- [ ] **You need to provide:** `NEXT_PUBLIC_META_CONFIG_ID`
- [ ] **You need to provide:** `META_APP_SECRET`
- [ ] **You need to provide:** `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- [ ] **You need to provide:** `CRON_SECRET`
- [ ] **Meta Dashboard:** Configure app permissions (`whatsapp_business_management` + `whatsapp_business_messaging`)
- [ ] **Meta Dashboard:** Add your domain to Allowed Domains / Valid OAuth Redirect URIs
- [ ] **Meta Dashboard:** Subscribe webhook URL (`/api/whatsapp/webhook`) and verify token
- [ ] **Message Templates:** Approved WhatsApp message templates (for reminders, outbound notifications beyond 24h customer-service window)

---

## 8. Architecture Notes

- **Secrets discipline:** The access token NEVER crosses to the browser. It lives only in `clinic_whatsapp_secrets` (zero RLS policies, service-role only).
- **Token exchange:** Happens exclusively server-side in `completeWhatsappSignupAction`. The 30-second-TTL code is consumed immediately.
- **One sending path:** All outbound WhatsApp messages flow through `lib/whatsapp/client.ts` — no duplicate implementations.
- **Shared AI logic:** Phase 13 webhook calls the same orchestrator used by widget/internal chat — no third booking-logic implementation.
- **Disconnect:** Clears both `clinic_whatsapp_config` and `clinic_whatsapp_secrets` rows.
