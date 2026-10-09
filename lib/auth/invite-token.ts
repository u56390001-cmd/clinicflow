/**
 * Invite-token primitives (migration 0011 model).
 *
 * The raw token is the capability: it is 32 random bytes rendered as 64 hex
 * characters, lives only in the invite link, and is never stored. Only its
 * SHA-256 hash is persisted (`clinic_invites.token_hash`), so a database leak
 * cannot be replayed into a membership. These helpers are runtime-agnostic
 * (Web Crypto is global in Node 18+ and the browser) so both the Server Actions
 * and the offline test runner can use the exact same code path.
 */

/** A raw invite token: 64 lowercase hex characters. */
export const INVITE_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

export function generateInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashInviteToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** The public link handed to the invitee. */
export function buildInviteUrl(
  token: string,
  baseUrl: string = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
): string {
  return `${baseUrl.replace(/\/+$/, "")}/invite/${token}`;
}
