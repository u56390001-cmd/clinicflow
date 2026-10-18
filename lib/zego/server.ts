import {
  createCipheriv,
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

/**
 * Phase 8 — server-side ZEGOcloud KitToken minting.
 *
 * The KitToken is the only credential the browser ever sees; the AppSecret
 * (`ZEGO_SERVER_SECRET`) stays here, on the server, and is used to AES-encrypt
 * the token payload. This reproduces the ZEGO `generateKitTokenForTest` /
 * `generateToken04` layout so the prebuilt UIKit accepts the token unchanged:
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

/** AES key sizes CryptoJS will accept for a UTF-8 server secret. */
const VALID_KEY_BYTES = new Set([16, 24, 32]);

function aesAlgFor(keyBytes: number): "aes-128-cbc" | "aes-192-cbc" | "aes-256-cbc" {
  if (keyBytes === 16) return "aes-128-cbc";
  if (keyBytes === 24) return "aes-192-cbc";
  return "aes-256-cbc";
}

/** 16 ASCII characters, matching the IV the UIKit generates client-side. */
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
