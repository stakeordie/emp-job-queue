import * as crypto from "crypto";

export function encryptString(plainText: string, password: string): string {
  const derivedKey = crypto.pbkdf2Sync(password, "salt", 100000, 32, "sha512");
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv("aes-256-gcm", derivedKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  const encryptedData = Buffer.concat([iv, tag, encrypted]).toString("base64");
  return encryptedData;
}

export function decryptString(encryptedData: string, password: string): string {
  const derivedKey = crypto.pbkdf2Sync(password, "salt", 100000, 32, "sha512");

  const rawData = Buffer.from(encryptedData, "base64");
  const iv = rawData.slice(0, 16);
  const tag = rawData.slice(16, 32);
  const encrypted = rawData.slice(32);

  const decipher = crypto.createDecipheriv("aes-256-gcm", derivedKey, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  const decryptedText = decrypted.toString("utf8");

  return decryptedText;
}
