/**
 * Central place for the auth/action `actionState` shape used by all forms.
 */

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

export type EmptyActionResult = ActionResult<undefined>;
