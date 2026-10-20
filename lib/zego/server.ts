import {
  createCipheriv,
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

import { createWidgetClient } from "@/lib/supabase/widget";

/**
 * Phase 8 — server-side ZEGOcloud KitToken minting.
 *
 * The KitToken is the only credential the browser ever sees; the AppSecret
 * (`ZEGO_SERVER_SECRET`) stays here, on the server, and is used to AES-encrypt
 * the token payload. This reproduces the ZEGO `generateToken04` layout accepted
 * by both the core WebRTC engine and the (now removed) prebuilt UIKit:
 *
 *   token = "04" + base64(header) + "#" + base64({ userID, roomID, userName, appID })
 *
 * The header is: 4 bytes version · 4 bytes expiry (BE) · 2 bytes IV length (BE) ·
 * IV · 2 bytes cipher length (BE) · AES-256-CBC(serverSecret, IV, payload).
 *
 * Server-only: uses `node:crypto`. Never import this from a Client Component.
 */

export type ZegoConfig = {
  appId: number;
  serverSecret: string;
};

/** Format validation shared by the settings screen and the token signer. */
export function validateZegoCredentials(
  appId: string,
  serverSecret: string,
): { ok: true; config: ZegoConfig } | { ok: false; message: string } {
  if (!/^[0-9]{1,15}$/.test(appId.trim())) {
    return {
      ok: false,
      message: "App ID must be the numeric ZEGOcloud App ID (digits only).",
    };
  }
  const secret = serverSecret.trim();
  if (![16, 24, 32].includes(secret.length)) {
    return {
      ok: false,
      message:
        "Server Secret must be exactly 16, 24 or 32 characters (it is AES-encrypted into every token).",
    };
  }
  return { ok: true, config: { appId: Number(appId.trim()), serverSecret: secret } };
}

export type ZegoSessionTokenInput = {
  roomId: string;
  userId: string;
  userName: string;
  /** Token lifetime in seconds. Defaults to two hours. */
  expiresInSeconds?: number;
};

/** Reads and validates the ZEGOcloud credentials from the environment. */
export function getZegoConfig(): ZegoConfig | null {
  const rawAppId = process.env.NEXT_PUBLIC_ZEGO_APP_ID ?? process.env.ZEGO_APP_ID;
  const serverSecret = process.env.ZEGO_SERVER_SECRET;
  if (!rawAppId || !serverSecret) return null;
  const appId = Number(rawAppId);
  if (!Number.isFinite(appId) || appId <= 0) return null;
  return { appId, serverSecret };
}

export function isTelehealthConfigured(): boolean {
  return getZegoConfig() !== null;
}

/** Where the credentials that minted a token came from. */
export type ZegoCredentialsSource = "clinic" | "platform";

/**
 * Resolves the ZEGOcloud credentials for one clinic: the clinic's own
 * connected App ID + Server Secret when set (per-clinic accounts, migration
 * 0107), otherwise the platform-wide env pair as the shared fallback.
 *
 * The secret row is service-role-only (RLS-enabled, zero policies), so this
 * lookup is the ONLY way it is ever read — by server-side token minting.
 */
export async function resolveZegoConfigForClinic(
  clinicId: string,
): Promise<{ config: ZegoConfig | null; source: ZegoCredentialsSource }> {
  const widget = createWidgetClient();
  const { data, error } = await widget
    .from("clinic_zego_config")
    .select("app_id, connection_status, clinic_zego_secrets(server_secret)")
    .eq("clinic_id", clinicId)
    .eq("connection_status", "connected")
    .maybeSingle();

  if (error) {
    console.error("[zego] clinic config lookup failed", {
      clinicId,
      message: error.message,
    });
  }

  const appId = typeof data?.app_id === "string" ? data.app_id : null;
  const secretRow = Array.isArray(data?.clinic_zego_secrets)
    ? data?.clinic_zego_secrets[0]
    : data?.clinic_zego_secrets;
  const serverSecret =
    secretRow && typeof secretRow === "object" && "server_secret" in secretRow
      ? ((secretRow as { server_secret?: string }).server_secret ?? null)
      : null;

  if (appId && serverSecret) {
    const config = validateZegoCredentials(appId, serverSecret);
    if (config.ok) return { config: config.config, source: "clinic" };
  }
  return { config: getZegoConfig(), source: "platform" };
}

/** AES key sizes CryptoJS will accept for a UTF-8 server secret. */
const VALID_KEY_BYTES = new Set([16, 24, 32]);

function aesAlgFor(keyBytes: number): "aes-128-cbc" | "aes-192-cbc" | "aes-256-cbc" {
  if (keyBytes === 16) return "aes-128-cbc";
  if (keyBytes === 24) return "aes-192-cbc";
  return "aes-256-cbc";
}

/** 16 ASCII characters — the IV layout ZEGO's HMAC-free Token04 expects. */
function randomIvString(): string {
  return randomBytes(8).toString("hex");
}

function base64(value: string | Buffer): string {
  return Buffer.from(value).toString("base64");
}

/**
 * Signs one KitToken for a single room user. Deterministic given its inputs, so
 * both the doctor and the patient get a token scoped to the same room but with
 * distinct identities.
 */
export function generateKitToken(
  config: ZegoConfig,
  input: ZegoSessionTokenInput,
): string {
  const { appId, serverSecret } = config;
  const { roomId, userId, userName } = input;
  const expiresInSeconds = input.expiresInSeconds ?? 7200;

  if (!userId) throw new Error("ZEGO token: userID is required.");
  if (!serverSecret) throw new Error("ZEGO token: serverSecret is required.");

  const keyBytes = Buffer.byteLength(serverSecret, "utf8");
  if (!VALID_KEY_BYTES.has(keyBytes)) {
    throw new Error(
      "ZEGO token: ZEGO_SERVER_SECRET must be 16, 24 or 32 bytes for AES.",
    );
  }

  const ctime = Math.floor(Date.now() / 1000);
  const payload = {
    app_id: appId,
    user_id: userId,
    nonce: randomInt(1, 2147483647),
    ctime,
    expire: ctime + expiresInSeconds,
  };

  const iv = randomIvString();
  const cipher = createCipheriv(
    aesAlgFor(keyBytes),
    Buffer.from(serverSecret, "utf8"),
    Buffer.from(iv, "utf8"),
  );
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);

  const header = Buffer.alloc(28 + ciphertext.length);
  header.writeUInt32BE(payload.expire >>> 0, 4);
  header.writeUInt16BE(iv.length, 8);
  header.write(iv, 10);
  header.writeUInt16BE(ciphertext.length, 26);
  ciphertext.copy(header, 28);

  const envelope = base64(
    JSON.stringify({
      userID: userId,
      roomID: roomId,
      userName: encodeURIComponent(userName),
      appID: appId,
    }),
  );

  return `04${base64(header)}#${envelope}`;
}

/**
 * A patient join link is a bearer capability: whoever holds the URL can join.
 * Storing a hash of the patient KitToken on the session (in `metadata`) turns
 * that into something the server can verify — the patient page and every
 * patient-side action re-derive the hash from the token in the URL, so a link
 * stops working the moment its session is replaced or closed, and a made-up
 * token can never read or attach anything.
 *
 * The same pattern the assessment share links already use
 * (`patient_share_links.token_hash`).
 */
export function hashPatientLinkToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Constant-time comparison of a stored link hash and the presented token. */
export function patientLinkTokenMatches(
  storedHash: unknown,
  presentedToken: string,
): boolean {
  if (typeof storedHash !== "string" || storedHash.length === 0) return false;
  let expected: Buffer;
  try {
    expected = Buffer.from(storedHash, "hex");
  } catch {
    return false;
  }
  const provided = Buffer.from(hashPatientLinkToken(presentedToken), "hex");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

export type ZegoTokenEnvelope = {
  userID: string;
  roomID: string;
  userName?: string;
  appID: number;
};

/**
 * Reads the identity half of a KitToken (the plain base64 envelope after the
 * `#`). Client-visible data only — themetic AES part stays untouched — so the
 * patient join page can hand the core engine the appID and userID the token
 * was minted for without any extra server round-trip.
 */
export function parseKitTokenEnvelope(token: string): ZegoTokenEnvelope | null {
  const parts = token.split("#");
  if (parts.length !== 2) return null;
  try {
    const payload = Buffer.from(parts[1] ?? "", "base64").toString("utf8");
    const parsed = JSON.parse(payload) as Partial<ZegoTokenEnvelope>;
    if (
      !parsed.userID ||
      typeof parsed.userID !== "string" ||
      typeof parsed.appID !== "number"
    ) {
      return null;
    }
    return {
      userID: parsed.userID,
      roomID: typeof parsed.roomID === "string" ? parsed.roomID : "",
      userName: parsed.userName,
      appID: parsed.appID,
    };
  } catch {
    return null;
  }
}

/** Deterministic, tenant-namespaced room id (clinic → doctor → patient). */export function buildTelehealthRoomId(params: {
  clinicId: string;
  doctorId: string | null;
  patientId: string;
  /** Injected for testability; defaults to the current epoch millis. */
  timestamp?: number;
}): string {
  const stamp = params.timestamp ?? Date.now();
  const doctor = params.doctorId ?? "none";
  return `clinic_${params.clinicId}_doc_${doctor}_pat_${params.patientId}_${stamp}`;
}
