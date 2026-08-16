import assert from "node:assert/strict";
import { createHmac } from "crypto";
import test from "node:test";

const toBase64Url = (value: Buffer | string): string =>
  Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const signHs256 = (payload: Record<string, unknown>, secret: string): string => {
  const header = { alg: "HS256", typ: "JWT" };
  const signingInput = `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(payload))}`;
  const signature = createHmac("sha256", secret).update(signingInput).digest();
  return `${signingInput}.${toBase64Url(signature)}`;
};

test("authenticateIntegration accepts a valid HS256 token", async () => {
  process.env.INTEGRATION_JWT_SHARED_SECRET = "integration-secret";
  process.env.INTEGRATION_JWT_ISSUER = "salthub";
  process.env.INTEGRATION_JWT_AUDIENCE = "survey-app";
  process.env.INTEGRATION_JWT_REQUIRED_SCOPE = "survey:invitation:create";

  const { authenticateIntegration } = await import("../../src/modules/integrations/integration-auth.middleware");

  const token = signHs256(
    {
      aud: "survey-app",
      exp: Math.floor(Date.now() / 1000) + 300,
      iat: Math.floor(Date.now() / 1000),
      iss: "salthub",
      jti: "jwt-1",
      scope: ["survey:invitation:create"],
      sub: "integration-user-1"
    },
    "integration-secret"
  );

  const request = {
    header: (name: string) => (name === "authorization" ? `Bearer ${token}` : undefined)
  } as any;

  await new Promise<void>((resolve, reject) => {
    authenticateIntegration(request, {} as any, (error?: unknown) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  assert.deepEqual(request.integration, {
    issuer: "salthub",
    jwtId: "jwt-1",
    scopes: ["survey:invitation:create"],
    userId: "integration-user-1"
  });
});

test("authenticateIntegration rejects a token without the required scope", async () => {
  process.env.INTEGRATION_JWT_SHARED_SECRET = "integration-secret";
  process.env.INTEGRATION_JWT_ISSUER = "salthub";
  process.env.INTEGRATION_JWT_AUDIENCE = "survey-app";
  process.env.INTEGRATION_JWT_REQUIRED_SCOPE = "survey:invitation:create";

  const { authenticateIntegration } = await import("../../src/modules/integrations/integration-auth.middleware");
  const { AppError } = await import("../../src/common/errors/app-error");
  const { ERROR_CODES } = await import("../../src/common/errors/error-codes");

  const token = signHs256(
    {
      aud: "survey-app",
      exp: Math.floor(Date.now() / 1000) + 300,
      iss: "salthub",
      scope: ["survey:read"],
      sub: "integration-user-1"
    },
    "integration-secret"
  );

  const request = {
    header: (name: string) => (name === "authorization" ? `Bearer ${token}` : undefined)
  } as any;

  await assert.rejects(
    () =>
      new Promise<void>((resolve, reject) => {
        authenticateIntegration(request, {} as any, (error?: unknown) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === ERROR_CODES.integrationScopeRequired
  );
});
