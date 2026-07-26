import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "crypto";

import { AppError } from "../errors/app-error";
import { ERROR_CODES } from "../errors/error-codes";
import { env } from "../../config/env";

const EMAIL_ENCRYPTION_VERSION = "v1";
const normalizeEmail = (email: string): string => email.trim().toLowerCase();
const getEmailProtectionConfig = () => {
  if (!env.invitationEmailHashSecret || !env.invitationEmailEncryptionKey) {
    throw new AppError(
      ERROR_CODES.internalServerError,
      "Invitation email protection is not configured.",
      503
    );
  }

  return {
    encryptionKey: env.invitationEmailEncryptionKey,
    hashSecret: env.invitationEmailHashSecret
  };
};

export const protectEmailForLookup = (email: string): string =>
  createHmac("sha256", getEmailProtectionConfig().hashSecret)
    .update(normalizeEmail(email), "utf8")
    .digest("hex");

export const encryptEmail = (email: string): string => {
  const iv = randomBytes(12);
  const key = Buffer.from(getEmailProtectionConfig().encryptionKey, "base64");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(normalizeEmail(email), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    EMAIL_ENCRYPTION_VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64")
  ].join(":");
};

export const decryptEmail = (payload: string): string => {
  const [version, ivBase64, tagBase64, ciphertextBase64] = payload.split(":");

  if (version !== EMAIL_ENCRYPTION_VERSION || !ivBase64 || !tagBase64 || !ciphertextBase64) {
    throw new Error("Invalid encrypted email payload.");
  }

  const key = Buffer.from(getEmailProtectionConfig().encryptionKey, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivBase64, "base64"));
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextBase64, "base64")),
    decipher.final()
  ]).toString("utf8");
};

export const normalizeInvitationEmail = normalizeEmail;
