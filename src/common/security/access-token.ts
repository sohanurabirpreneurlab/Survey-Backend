import { createHash, createHmac, timingSafeEqual } from "crypto";

import { AppError } from "../errors/app-error";
import { ERROR_CODES } from "../errors/error-codes";
import { env } from "../../config/env";

type AccessTokenPayload = {
  aud: "survey-platform";
  email: string;
  exp: number;
  iat: number;
  iss: "survey-backend";
  sessionId: string;
  sub: string;
  type: "access";
};

const ACCESS_TOKEN_AUDIENCE = "survey-platform";
const ACCESS_TOKEN_ISSUER = "survey-backend";

const toBase64Url = (value: Buffer | string): string =>
  Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const fromBase64Url = (value: string): Buffer => {
  const normalizedValue = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (normalizedValue.length % 4)) % 4;
  return Buffer.from(normalizedValue + "=".repeat(padding), "base64");
};

const getAccessTokenSecret = (): string =>
  env.authJwtSecret ?? createHash("sha256").update(env.databaseUrl, "utf8").digest("hex");

const parseJsonPart = (value: string): Record<string, unknown> => {
  try {
    return JSON.parse(fromBase64Url(value).toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new AppError(ERROR_CODES.invalidAuthToken, "The bearer token is invalid.", 401);
  }
};

const buildSignature = (headerPart: string, payloadPart: string): Buffer =>
  createHmac("sha256", getAccessTokenSecret())
    .update(`${headerPart}.${payloadPart}`)
    .digest();

export const signAccessToken = (input: {
  email: string;
  expiresAtUnix: number;
  sessionId: string;
  userId: string;
}): string => {
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const headerPart = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload: AccessTokenPayload = {
    aud: ACCESS_TOKEN_AUDIENCE,
    email: input.email,
    exp: input.expiresAtUnix,
    iat: nowInSeconds,
    iss: ACCESS_TOKEN_ISSUER,
    sessionId: input.sessionId,
    sub: input.userId,
    type: "access"
  };
  const payloadPart = toBase64Url(JSON.stringify(payload));
  const signaturePart = toBase64Url(buildSignature(headerPart, payloadPart));

  return `${headerPart}.${payloadPart}.${signaturePart}`;
};

export const verifyAccessToken = (
  token: string
): {
  email: string;
  sessionId: string;
  userId: string;
} => {
  const parts = token.split(".");

  if (parts.length !== 3) {
    throw new AppError(ERROR_CODES.invalidAuthToken, "The bearer token is invalid.", 401);
  }

  const [headerPart, payloadPart, signaturePart] = parts;
  const header = parseJsonPart(headerPart);
  const payload = parseJsonPart(payloadPart) as Partial<AccessTokenPayload>;
  const expectedSignature = buildSignature(headerPart, payloadPart);
  const actualSignature = fromBase64Url(signaturePart);

  if (
    header.alg !== "HS256" ||
    header.typ !== "JWT" ||
    expectedSignature.length !== actualSignature.length ||
    !timingSafeEqual(expectedSignature, actualSignature)
  ) {
    throw new AppError(ERROR_CODES.invalidAuthToken, "The bearer token is invalid.", 401);
  }

  if (
    payload.type !== "access" ||
    payload.iss !== ACCESS_TOKEN_ISSUER ||
    payload.aud !== ACCESS_TOKEN_AUDIENCE ||
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.sessionId !== "string" ||
    typeof payload.exp !== "number"
  ) {
    throw new AppError(ERROR_CODES.invalidAuthToken, "The bearer token is invalid.", 401);
  }

  if (payload.exp * 1000 <= Date.now()) {
    throw new AppError(ERROR_CODES.authSessionExpired, "The authentication session has expired.", 401);
  }

  return {
    email: payload.email,
    sessionId: payload.sessionId,
    userId: payload.sub
  };
};
