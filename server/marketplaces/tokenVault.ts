import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const TOKEN_FORMAT_VERSION = "v1";
const TOKEN_KEY_SALT = "vitrineml-marketplace-token-v1";

function deriveKey(clientSecret: string) {
  if (!clientSecret) throw new Error("Marketplace token encryption is unavailable.");
  return scryptSync(clientSecret, TOKEN_KEY_SALT, 32);
}

export function encryptMarketplaceToken(token: string, clientSecret: string): string {
  if (!token) throw new Error("Cannot encrypt an empty marketplace token.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(clientSecret), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [TOKEN_FORMAT_VERSION, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptMarketplaceToken(value: string, clientSecret: string): string {
  try {
    const [version, ivValue, tagValue, cipherValue, extra] = value.split(".");
    if (version !== TOKEN_FORMAT_VERSION || !ivValue || !tagValue || !cipherValue || extra !== undefined) {
      throw new Error("Invalid token format");
    }
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(clientSecret), Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(cipherValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    throw new Error("Marketplace token could not be decrypted; reconnect the account.", { cause: error });
  }
}
