import { databasePool } from "../../config/database";
import { AppError } from "../../common/errors/app-error";
import { ERROR_CODES } from "../../common/errors/error-codes";
import { hasColumn } from "../../common/utils/schema-capabilities";
import type { UserProfile } from "./auth.types";
import type { AuthAccountRecord, AuthSessionRecord, IAuthRepository } from "./auth.repository.interface";

const mapUserProfile = (row: Record<string, unknown>): UserProfile => ({
  accountStatus: row.account_status as UserProfile["accountStatus"],
  approvedAt: row.approved_at ? String(row.approved_at) : null,
  createdAt: String(row.profile_created_at),
  fullName: String(row.full_name),
  organization: row.organization ? String(row.organization) : null,
  rejectedAt: row.rejected_at ? String(row.rejected_at) : null,
  role: row.role as UserProfile["role"],
  suspendedAt: row.suspended_at ? String(row.suspended_at) : null,
  updatedAt: String(row.profile_updated_at),
  userId: String(row.user_id)
});

const mapAuthAccount = (row: Record<string, unknown>): AuthAccountRecord => ({
  createdAt: String(row.user_created_at),
  email: String(row.email),
  emailVerifiedAt: row.email_verified_at ? String(row.email_verified_at) : null,
  passwordHash: String(row.password_hash),
  profile: mapUserProfile(row),
  updatedAt: String(row.user_updated_at),
  userId: String(row.user_id)
});

const mapAuthSession = (row: Record<string, unknown>): AuthSessionRecord => ({
  createdAt: String(row.created_at),
  expiresAt: String(row.expires_at),
  id: String(row.id),
  refreshTokenHash: String(row.refresh_token_hash),
  revokedAt: row.revoked_at ? String(row.revoked_at) : null,
  userId: String(row.user_id)
});

const buildAccountSelection = async (): Promise<string> => {
  const organizationSelect = (await hasColumn("user_profiles", "organization"))
    ? "p.organization,"
    : "null::uuid as organization,";

  return `
    select
      u.id as user_id,
      u.email,
      u.password_hash,
      u.email_verified_at,
      u.created_at as user_created_at,
      u.updated_at as user_updated_at,
      p.full_name,
      p.role,
      p.account_status,
      ${organizationSelect}
      p.approved_at,
      p.rejected_at,
      p.suspended_at,
      p.created_at as profile_created_at,
      p.updated_at as profile_updated_at
    from app_users u
    inner join user_profiles p
      on p.user_id = u.id
  `;
};

export class AuthRepository implements IAuthRepository {
  public async createUserAccount(input: {
    email: string;
    fullName: string;
    organizationId: string;
    passwordHash: string;
    userId: string;
  }): Promise<AuthAccountRecord> {
    const client = await databasePool.connect();

    try {
      await client.query("begin");
      const organizationColumnExists = await hasColumn("user_profiles", "organization");
      const accountSelection = await buildAccountSelection();
      await client.query(
        `
          insert into app_users (id, email, password_hash, email_verified_at)
          values ($1, $2, $3, now())
        `,
        [input.userId, input.email, input.passwordHash]
      );
      if (organizationColumnExists) {
        await client.query(
          `
            insert into user_profiles (user_id, full_name, role, account_status, organization)
            values ($1, $2, 'business_owner', 'pending', $3)
          `,
          [input.userId, input.fullName, input.organizationId]
        );
      } else {
        await client.query(
          `
            insert into user_profiles (user_id, full_name, role, account_status)
            values ($1, $2, 'business_owner', 'pending')
          `,
          [input.userId, input.fullName]
        );
      }
      const result = await client.query(
        `
          ${accountSelection}
          where u.id = $1
        `,
        [input.userId]
      );
      await client.query("commit");

      return mapAuthAccount(result.rows[0] as Record<string, unknown>);
    } catch (error) {
      await client.query("rollback");

      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        throw new AppError(
          ERROR_CODES.registrationFailed,
          "An account with that email already exists.",
          409
        );
      }

      throw error;
    } finally {
      client.release();
    }
  }

  public async findUserByEmail(email: string): Promise<AuthAccountRecord | null> {
    const accountSelection = await buildAccountSelection();
    const result = await databasePool.query(
      `
        ${accountSelection}
        where lower(u.email) = lower($1)
      `,
      [email]
    );

    return result.rowCount ? mapAuthAccount(result.rows[0] as Record<string, unknown>) : null;
  }

  public async findUserByUserId(userId: string): Promise<AuthAccountRecord | null> {
    const accountSelection = await buildAccountSelection();
    const result = await databasePool.query(
      `
        ${accountSelection}
        where u.id = $1
      `,
      [userId]
    );

    return result.rowCount ? mapAuthAccount(result.rows[0] as Record<string, unknown>) : null;
  }

  public async createSession(input: {
    expiresAt: string;
    refreshTokenHash: string;
    sessionId: string;
    userId: string;
  }): Promise<void> {
    await databasePool.query(
      `
        insert into auth_sessions (id, user_id, refresh_token_hash, expires_at)
        values ($1, $2, $3, $4::timestamptz)
      `,
      [input.sessionId, input.userId, input.refreshTokenHash, input.expiresAt]
    );
  }

  public async findActiveSessionById(sessionId: string): Promise<AuthSessionRecord | null> {
    const result = await databasePool.query(
      `
        select *
        from auth_sessions
        where id = $1
          and revoked_at is null
          and expires_at > now()
      `,
      [sessionId]
    );

    return result.rowCount ? mapAuthSession(result.rows[0] as Record<string, unknown>) : null;
  }

  public async findActiveSessionByRefreshTokenHash(
    refreshTokenHash: string
  ): Promise<AuthSessionRecord | null> {
    const result = await databasePool.query(
      `
        select *
        from auth_sessions
        where refresh_token_hash = $1
          and revoked_at is null
          and expires_at > now()
      `,
      [refreshTokenHash]
    );

    return result.rowCount ? mapAuthSession(result.rows[0] as Record<string, unknown>) : null;
  }

  public async rotateSession(input: {
    expiresAt: string;
    refreshTokenHash: string;
    sessionId: string;
  }): Promise<void> {
    await databasePool.query(
      `
        update auth_sessions
        set refresh_token_hash = $2,
            expires_at = $3::timestamptz
        where id = $1
      `,
      [input.sessionId, input.refreshTokenHash, input.expiresAt]
    );
  }

  public async revokeSession(sessionId: string): Promise<void> {
    await databasePool.query(
      `
        update auth_sessions
        set revoked_at = now()
        where id = $1
          and revoked_at is null
      `,
      [sessionId]
    );
  }
}
