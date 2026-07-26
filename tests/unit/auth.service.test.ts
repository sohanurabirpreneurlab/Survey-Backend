import assert from "node:assert/strict";
import test from "node:test";

import { hashPassword } from "../../src/common/security/password-hash";
import { AppError } from "../../src/common/errors/app-error";
import { ERROR_CODES } from "../../src/common/errors/error-codes";
import { AuthService } from "../../src/modules/auth/auth.service";
import type { AuthAccountRecord, AuthSessionRecord } from "../../src/modules/auth/auth.repository.interface";
import type { UserProfile } from "../../src/modules/auth/auth.types";

const buildProfile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  accountStatus: "pending",
  approvedAt: null,
  createdAt: "2026-07-26T00:00:00.000Z",
  fullName: "Business Owner",
  rejectedAt: null,
  role: "business_owner",
  suspendedAt: null,
  updatedAt: "2026-07-26T00:00:00.000Z",
  userId: "user-1",
  ...overrides
});

const buildAccount = async (
  overrides: Partial<AuthAccountRecord> = {}
): Promise<AuthAccountRecord> => ({
  createdAt: "2026-07-26T00:00:00.000Z",
  email: "owner@example.com",
  emailVerifiedAt: "2026-07-26T00:00:00.000Z",
  passwordHash: await hashPassword("StrongPassword123!"),
  profile: buildProfile(),
  updatedAt: "2026-07-26T00:00:00.000Z",
  userId: "user-1",
  ...overrides
});

const buildSession = (overrides: Partial<AuthSessionRecord> = {}): AuthSessionRecord => ({
  createdAt: "2026-07-26T00:00:00.000Z",
  expiresAt: "2026-08-25T00:00:00.000Z",
  id: "session-1",
  refreshTokenHash: "refresh-token-hash",
  revokedAt: null,
  userId: "user-1",
  ...overrides
});

test("register creates a pending business_owner profile", async () => {
  const createdUsers: Array<{ email: string; fullName: string; passwordHash: string; userId: string }> = [];

  const service = new AuthService({
    createSession: async () => undefined,
    createUserAccount: async (input) => {
      createdUsers.push(input);

      return buildAccount({
        email: input.email,
        profile: buildProfile({ fullName: input.fullName, userId: input.userId }),
        userId: input.userId
      });
    },
    findActiveSessionById: async () => null,
    findActiveSessionByRefreshTokenHash: async () => null,
    findUserByEmail: async () => null,
    findUserByUserId: async () => null,
    revokeSession: async () => undefined,
    rotateSession: async () => undefined
  });

  const result = await service.register({
    email: "OWNER@example.com",
    fullName: "Business Owner",
    password: "StrongPassword123!"
  });

  assert.equal(createdUsers.length, 1);
  assert.equal(createdUsers[0].email, "owner@example.com");
  assert.equal(result.user.accountStatus, "pending");
  assert.equal(result.user.role, "business_owner");
  assert.equal(result.requiresApproval, true);
  assert.equal(result.user.email, "owner@example.com");
  assert.equal(result.emailVerificationRequired, false);
});

test("login returns pending_approval for a pending account", async () => {
  const createdSessions: AuthSessionRecord[] = [];

  const service = new AuthService({
    createSession: async (input) => {
      createdSessions.push(
        buildSession({
          expiresAt: input.expiresAt,
          id: input.sessionId,
          refreshTokenHash: input.refreshTokenHash,
          userId: input.userId
        })
      );
    },
    createUserAccount: async () => {
      throw new Error("not used");
    },
    findActiveSessionById: async () => null,
    findActiveSessionByRefreshTokenHash: async () => null,
    findUserByEmail: async () => buildAccount(),
    findUserByUserId: async () => null,
    revokeSession: async () => undefined,
    rotateSession: async () => undefined
  });

  const result = await service.login({
    email: "owner@example.com",
    password: "StrongPassword123!"
  });

  assert.equal(result.accessState, "pending_approval");
  assert.equal(result.requiresApproval, true);
  assert.equal(result.user.accountStatus, "pending");
  assert.equal(createdSessions.length, 1);
  assert.equal(typeof result.accessToken, "string");
  assert.equal(typeof result.refreshToken, "string");
});

test("login returns approved for an approved account", async () => {
  const service = new AuthService({
    createSession: async () => undefined,
    createUserAccount: async () => {
      throw new Error("not used");
    },
    findActiveSessionById: async () => null,
    findActiveSessionByRefreshTokenHash: async () => null,
    findUserByEmail: async () =>
      buildAccount({
        profile: buildProfile({ accountStatus: "approved" })
      }),
    findUserByUserId: async () => null,
    revokeSession: async () => undefined,
    rotateSession: async () => undefined
  });

  const result = await service.login({
    email: "owner@example.com",
    password: "StrongPassword123!"
  });

  assert.equal(result.accessState, "approved");
  assert.equal(result.requiresApproval, false);
  assert.equal(result.user.accountStatus, "approved");
});

test("login rejects invalid credentials when the account is missing", async () => {
  const service = new AuthService({
    createSession: async () => undefined,
    createUserAccount: async () => {
      throw new Error("not used");
    },
    findActiveSessionById: async () => null,
    findActiveSessionByRefreshTokenHash: async () => null,
    findUserByEmail: async () => null,
    findUserByUserId: async () => null,
    revokeSession: async () => undefined,
    rotateSession: async () => undefined
  });

  await assert.rejects(
    () =>
      service.login({
        email: "owner@example.com",
        password: "StrongPassword123!"
      }),
    (error: unknown) =>
      error instanceof AppError && error.code === ERROR_CODES.invalidCredentials
  );
});
