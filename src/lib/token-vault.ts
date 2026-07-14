import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

type VaultPayload = {
  iv: string;
  tag: string;
  data: string;
};

function getKey() {
  const secret = process.env.ACADEMIC_OS_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error("ACADEMIC_OS_ENCRYPTION_SECRET is required to encrypt integration tokens.");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  const payload: VaultPayload = {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  };

  return JSON.stringify(payload);
}

export function decryptSecret(payload: string) {
  const parsed = JSON.parse(payload) as Partial<VaultPayload>;
  if (!parsed.iv || !parsed.tag || !parsed.data) {
    throw new Error("Invalid encrypted secret payload.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(parsed.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(parsed.data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
