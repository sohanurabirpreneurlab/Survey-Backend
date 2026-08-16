import { createHmac, createPublicKey, createVerify } from "crypto";
import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../common/errors/app-error";
import { ERROR_CODES } from "../../common/errors/error-codes";
import { env } from "../../config/env";

type JwtPayload = {
  aud?: string | string[];
  exp?: number;
  iat?: number;
  iss?: string;
  jti?: string;
  nbf?: number;
  scope?: string | string[];
  sub?: string;
};

const getBearerToken = (request: Request): string => {
  const authorizationHeader = request.header("authorization");

  if (!authorizationHeader) {
    throw new AppError(
      ERROR_CODES.authenticationRequired,
      "A bearer token is required.",
      401
    );
  }

  const [scheme, token] = authorizationHeader.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new AppError(ERROR_CODES.invalidAuthToken, "The bearer token is invalid.", 401);
  }

  return token;
};

const decodeBase64Url = (value: string): Buffer => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = normalized.length % 4;
  const padded = remainder === 0 ? normalized : normalized.padEnd(normalized.length + (4 - remainder), "=");
  return Buffer.from(padded, "base64");
};

const parseJwt = (token: string): {
  header: { alg?: string; typ?: string };
  payload: JwtPayload;
  signature: string;
  signingInput: string;
} => {
  const parts = token.split(".");

  if (parts.length !== 3) {
    throw new AppError(ERROR_CODES.invalidAuthToken, "The integration token is malformed.", 401);
  }

  try {
    return {
      header: JSON.parse(decodeBase64Url(parts[0]).toString("utf8")) as { alg?: string; typ?: string },
      payload: JSON.parse(decodeBase64Url(parts[1]).toString("utf8")) as JwtPayload,
      signature: parts[2],
      signingInput: `${parts[0]}.${parts[1]}`
    };
  } catch {
    throw new AppError(ERROR_CODES.invalidAuthToken, "The integration token is malformed.", 401);
  }
};

const verifyJwtSignature = (token: ReturnType<typeof parseJwt>): void => {
  const signature = decodeBase64Url(token.signature);

  if (token.header.alg === "HS256") {
    if (!env.integrationJwtSharedSecret) {
      throw new AppError(ERROR_CODES.internalServerError, "Integration JWT shared secret is not configured.", 500);
    }

    const expected = createHmac("sha256", env.integrationJwtSharedSecret)
      .update(token.signingInput)
      .digest();

    if (!expected.equals(signature)) {
      throw new AppError(ERROR_CODES.invalidAuthToken, "The integration token signature is invalid.", 401);
    }

    return;
  }

  if (token.header.alg === "RS256" || token.header.alg === "ES256") {
    if (!env.integrationJwtPublicKey) {
      throw new AppError(ERROR_CODES.internalServerError, "Integration JWT public key is not configured.", 500);
    }

    const key = createPublicKey(env.integrationJwtPublicKey);
    const verifier = createVerify(token.header.alg === "RS256" ? "RSA-SHA256" : "sha256");
    verifier.update(token.signingInput);
    verifier.end();

    if (!verifier.verify(key, signature)) {
      throw new AppError(ERROR_CODES.invalidAuthToken, "The integration token signature is invalid.", 401);
    }

    return;
  }

  throw new AppError(ERROR_CODES.invalidAuthToken, "The integration token algorithm is not supported.", 401);
};

const normalizeScopes = (scope: JwtPayload["scope"]): string[] => {
  if (Array.isArray(scope)) {
    return scope.map((value) => String(value)).filter(Boolean);
  }

  if (typeof scope === "string") {
    return scope.split(" ").map((value) => value.trim()).filter(Boolean);
  }

  return [];
};

const audienceMatches = (audience: JwtPayload["aud"], expectedAudience: string): boolean => {
  if (Array.isArray(audience)) {
    return audience.includes(expectedAudience);
  }

  return audience === expectedAudience;
};

export const authenticateIntegration = (
  request: Request,
  _response: Response,
  next: NextFunction
): void => {
  try {
    const token = parseJwt(getBearerToken(request));
    verifyJwtSignature(token);

    const now = Math.floor(Date.now() / 1000);
    const scopes = normalizeScopes(token.payload.scope);

    if (!token.payload.sub || !token.payload.iss || !token.payload.exp) {
      throw new AppError(ERROR_CODES.invalidAuthToken, "The integration token is missing required claims.", 401);
    }

    if (env.integrationJwtIssuer && token.payload.iss !== env.integrationJwtIssuer) {
      throw new AppError(ERROR_CODES.invalidAuthToken, "The integration token issuer is invalid.", 401);
    }

    if (env.integrationJwtAudience && !audienceMatches(token.payload.aud, env.integrationJwtAudience)) {
      throw new AppError(ERROR_CODES.invalidAuthToken, "The integration token audience is invalid.", 401);
    }

    if (token.payload.nbf && token.payload.nbf > now) {
      throw new AppError(ERROR_CODES.invalidAuthToken, "The integration token is not active yet.", 401);
    }

    if (token.payload.exp <= now) {
      throw new AppError(ERROR_CODES.invalidAuthToken, "The integration token has expired.", 401);
    }

    if (!scopes.includes(env.integrationJwtRequiredScope)) {
      throw new AppError(
        ERROR_CODES.integrationScopeRequired,
        "The integration token does not have the required scope.",
        403
      );
    }

    request.integration = {
      issuer: token.payload.iss,
      jwtId: token.payload.jti ?? null,
      scopes,
      userId: token.payload.sub
    };

    next();
  } catch (error) {
    next(error);
  }
};
