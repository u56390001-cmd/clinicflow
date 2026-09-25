-- =============================================================================
-- MedBook AI — Phase 6 | Migration 0008
-- Public Widget: appearance config + activation gate
--
-- DESIGN NOTES
-- ------------
-- * Extends `clinic_ai_settings` with widget-specific columns rather than a
--   new table — keeps the one-to-one relationship clean and avoids an extra
--   JOIN for every widget load.
-- * `is_activated` is the public gate: the widget and public chat API refuse
--   to operate unless this is true. A clinic may have AI settings (for the
--   internal test chat) without having activated the public widget.
-- * `widget_color` stores a hex color (#RRGGBB) for the launcher and panel
--   accent. Defaults to the app's primary (#0D9488).
-- * `widget_position` controls placement: 'bottom-right' or 'bottom-left'.
-- * `widget_avatar_url` is an optional URL for the agent avatar shown in the
--   chat header. Null means the default icon is used.
-- * `widget_header_subtitle` is a short subtitle under the agent name in the
--   chat header (e.g. the clinic name). Null falls back to the clinic name.
-- * RLS: no new policies needed — we only add columns to an existing table
--   with existing policies. The public widget reads through a service-role
--   server-side client, not through RLS.
-- * All statements are idempotent (IF NOT EXISTS).
-- =============================================================================

-- ----------------------------------------------------------------------------
-- add widget columns to clinic_ai_settings
-- ----------------------------------------------------------------------------
alter table public.clinic_ai_settings
  add column if not exists is_activated boolean not null default false;

alter table public.clinic_ai_settings
  add column if not exists widget_color text not null default '#0D9488'
  check (widget_color ~ '^#[0-9A-Fa-f]{6}$');

alter table public.clinic_ai_settings
  add column if not exists widget_position text not null default 'bottom-right'
  check (widget_position in ('bottom-right', 'bottom-left'));

alter table public.clinic_ai_settings
  add column if not exists widget_avatar_url text
  check (widget_avatar_url is null or char_length(btrim(widget_avatar_url)) between 1 and 500);

alter table public.clinic_ai_settings
  add column if not exists widget_header_subtitle text
  check (widget_header_subtitle is null or char_length(btrim(widget_header_subtitle)) between 1 and 120);

-- =============================================================================
-- VERIFICATION (manual; mirrors the Phase 6 checklist)
-- -----------------------------------------------------------------------------
-- 1. A clinic with is_activated = false: /widget/[slug] shows "not available",
--    /api/widget/chat returns 403.
-- 2. A clinic with is_activated = true: widget renders with configured color,
--    position, subtitle and avatar.
-- 3. Widget color must be a valid hex color (DB CHECK rejects invalid values).
-- 4. Widget position must be 'bottom-right' or 'bottom-left' (DB CHECK).
-- 5. Existing internal test chat (/app/ai-test) is unaffected.
-- =============================================================================
