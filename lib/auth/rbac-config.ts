/**
 * RBAC configuration — the single source of truth for granular permissions.
 *
 * The database `clinic_role` enum carries the role; this module maps each role
 * to its default permission set. Per-member overrides live in
 * `clinic_members.permissions` (JSONB) and are applied by `lib/auth/role-guard.ts`.
 *
 * Roles `admin` and `staff` are legacy aliases kept for backward compatibility
 * (migration 0001). `clinic_admin` is the new granular equivalent of `admin`.
 */

import type { ClinicRole } from "@/types/database";

/**
 * Every role the system understands. Deliberately identical to the database
 * `clinic_role` enum (`types/database.ts`) so the app layer and the DB can never
 * disagree about what a role means.
 */
export type ExtendedRole = ClinicRole;

export type Permission =
  | "patients:read"
  | "patients:write"
  | "patients:delete"
  | "appointments:read"
  | "appointments:write"
  | "prescriptions:read"
  | "prescriptions:write"
  | "billing:read"
  | "billing:write"
  | "reports:read"
  | "settings:manage"
  | "staff:manage";

/** Default permissions granted to each role (before per-member overrides). */
export const DEFAULT_ROLE_PERMISSIONS: Record<ExtendedRole, readonly Permission[]> = {
  owner: [
    "patients:read",
    "patients:write",
    "patients:delete",
    "appointments:read",
    "appointments:write",
    "prescriptions:read",
    "prescriptions:write",
    "billing:read",
    "billing:write",
    "reports:read",
    "settings:manage",
    "staff:manage",
  ],
  clinic_admin: [
    "patients:read",
    "patients:write",
    "appointments:read",
    "appointments:write",
    "prescriptions:read",
    "prescriptions:write",
    "billing:read",
    "billing:write",
    "reports:read",
    "staff:manage",
  ],
  doctor: [
    "patients:read",
    "patients:write",
    "appointments:read",
    "appointments:write",
    "prescriptions:read",
    "prescriptions:write",
    "reports:read",
  ],
  receptionist: [
    "patients:read",
    "patients:write",
    "appointments:read",
    "appointments:write",
    "billing:read",
    "billing:write",
  ],
  nurse: ["patients:read", "appointments:read", "prescriptions:read"],
  accountant: ["billing:read", "billing:write", "reports:read"],
  // Legacy fallbacks — keep old rows working without a data migration.
  admin: [
    "patients:read",
    "patients:write",
    "appointments:read",
    "appointments:write",
    "prescriptions:read",
    "prescriptions:write",
    "billing:read",
    "billing:write",
    "reports:read",
    "staff:manage",
  ],
  staff: [
    "patients:read",
    "patients:write",
    "appointments:read",
    "appointments:write",
    "billing:read",
  ],
};

/** Human-readable labels for permission badges in the UI. */
export const PERMISSION_LABELS: Record<Permission, string> = {
  "patients:read": "View patients",
  "patients:write": "Edit patients",
  "patients:delete": "Delete patients",
  "appointments:read": "View appointments",
  "appointments:write": "Manage appointments",
  "prescriptions:read": "View prescriptions",
  "prescriptions:write": "Write prescriptions",
  "billing:read": "View billing",
  "billing:write": "Manage billing",
  "reports:read": "View reports",
  "settings:manage": "Manage settings",
  "staff:manage": "Manage staff",
};

/** Human-readable labels for every role (shared by the team UI and sidebar). */
export const ROLE_LABELS: Record<ExtendedRole, string> = {
  owner: "Owner",
  clinic_admin: "Clinic Admin",
  doctor: "Doctor",
  receptionist: "Receptionist",
  nurse: "Nurse",
  accountant: "Accountant",
  admin: "Admin (legacy)",
  staff: "Staff (legacy)",
};

/** All permissions in a stable display order. */
export const ALL_PERMISSIONS: readonly Permission[] = Object.keys(
  PERMISSION_LABELS,
) as Permission[];
