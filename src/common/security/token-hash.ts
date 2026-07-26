import { createHash, randomBytes } from "crypto";

const toBase64Url = (value: Buffer): string =>
  value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

export const createSecureToken = (): string => toBase64Url(randomBytes(32));

export const hashToken = (rawToken: string): string =>
  createHash("sha256").update(rawToken, "utf8").digest("hex");
