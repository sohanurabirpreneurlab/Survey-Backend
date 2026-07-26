import type { UserProfile } from "./auth.types";

export type AuthAccountRecord = {
  createdAt: string;
  email: string;
  emailVerifiedAt: string | null;
  passwordHash: string;
  profile: UserProfile;
  updatedAt: string;
  userId: string;
};

export type AuthSessionRecord = {
  createdAt: string;
  expiresAt: string;
  id: string;
  refreshTokenHash: string;
  revokedAt: string | null;
  userId: string;
};

export interface IAuthRepository {
  createUserAccount(input: {
    email: string;
    fullName: string;
    passwordHash: string;
    userId: string;
  }): Promise<AuthAccountRecord>;
  createSession(input: {
    expiresAt: string;
    refreshTokenHash: string;
    sessionId: string;
    userId: string;
  }): Promise<void>;
  findActiveSessionById(sessionId: string): Promise<AuthSessionRecord | null>;
  findActiveSessionByRefreshTokenHash(refreshTokenHash: string): Promise<AuthSessionRecord | null>;
  findUserByEmail(email: string): Promise<AuthAccountRecord | null>;
  findUserByUserId(userId: string): Promise<AuthAccountRecord | null>;
  revokeSession(sessionId: string): Promise<void>;
  rotateSession(input: {
    expiresAt: string;
    refreshTokenHash: string;
    sessionId: string;
  }): Promise<void>;
}
