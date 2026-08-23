import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_LENGTH = 12; // 96 bits for GCM

/**
 * Resolves the ENCRYPTION_KEY environment variable to a 32-byte Buffer.
 * Supports 64-char hex strings, 32-byte raw strings, or base64 strings.
 * Throws an error if key is missing or invalid length.
 */
export function getEncryptionKey(overrideKey?: string): Buffer {
  const rawKey = overrideKey || process.env.ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error(
      "[encryption] ENCRYPTION_KEY environment variable is missing. Set a 32-byte hex/base64 key in .env.local"
    );
  }

  let keyBuf: Buffer;
  if (rawKey.length === 64 && /^[0-9a-fA-F]+$/.test(rawKey)) {
    keyBuf = Buffer.from(rawKey, "hex");
  } else if (Buffer.from(rawKey, "utf-8").length === 32) {
    keyBuf = Buffer.from(rawKey, "utf-8");
  } else {
    keyBuf = Buffer.from(rawKey, "base64");
  }

  if (keyBuf.length !== 32) {
    throw new Error(
      `[encryption] Invalid ENCRYPTION_KEY: Must resolve to exactly 32 bytes (got ${keyBuf.length} bytes).`
    );
  }

  return keyBuf;
}

/**
 * Encrypts a plain text string (e.g. Gmail refresh token) using AES-256-GCM.
 * Output format: `v1:iv_hex:authTag_hex:ciphertext_hex`
 */
export function encryptToken(text: string, overrideKey?: string): string {
  if (!text) {
    throw new Error("[encryption] Cannot encrypt empty string.");
  }

  const key = getEncryptionKey(overrideKey);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = cipherIv(key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");
  const ivHex = iv.toString("hex");

  return `${VERSION}:${ivHex}:${authTag}:${encrypted}`;
}

function cipherIv(key: Buffer, iv: Buffer) {
  return crypto.createCipheriv(ALGORITHM, key, iv);
}

/**
 * Decrypts an encrypted token string (`v1:iv_hex:authTag_hex:ciphertext_hex`).
 * Throws error if key is incorrect, ciphertext is tampered, or auth tag fails.
 */
export function decryptToken(encryptedText: string, overrideKey?: string): string {
  if (!encryptedText) {
    throw new Error("[encryption] Cannot decrypt empty string.");
  }

  const parts = encryptedText.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("[encryption] Invalid or unsupported encrypted token format.");
  }

  const [, ivHex, authTagHex, ciphertextHex] = parts;
  const key = getEncryptionKey(overrideKey);
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
