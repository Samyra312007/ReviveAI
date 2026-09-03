import crypto from "node:crypto";

/**
 * AES-256-GCM encryption for at-rest secrets (Razorpay key secrets,
 * webhook secrets). Key is derived from AUTH_SECRET so no extra env var
 * is required. Format: `enc:v1:<iv hex>:<tag hex>:<ciphertext hex>`.
 */

function getKey(): Buffer {
  const secret = process.env.AUTH_SECRET ?? "reviveai-dev-secret";
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts[0] !== "enc" || parts[1] !== "v1") {
    // Legacy plaintext fallback (dev only) — never write new plaintext.
    return payload;
  }
  const [, , ivHex, tagHex, dataHex] = parts;
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}