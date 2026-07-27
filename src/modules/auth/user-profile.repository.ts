import { databasePool } from "../../config/database";
import { hasColumn } from "../../common/utils/schema-capabilities";
import type { UserProfile } from "./auth.types";
import type { IUserProfileRepository } from "./user-profile.repository.interface";

const mapUserProfile = (row: Record<string, unknown>): UserProfile => ({
  accountStatus: row.account_status as UserProfile["accountStatus"],
  approvedAt: row.approved_at ? String(row.approved_at) : null,
  createdAt: String(row.created_at),
  fullName: String(row.full_name),
  organization: row.organization ? String(row.organization) : null,
  rejectedAt: row.rejected_at ? String(row.rejected_at) : null,
  role: row.role as UserProfile["role"],
  suspendedAt: row.suspended_at ? String(row.suspended_at) : null,
  updatedAt: String(row.updated_at),
  userId: String(row.user_id)
});

export class UserProfileRepository implements IUserProfileRepository {
  public async create(input: { fullName: string; userId: string }): Promise<UserProfile> {
    const organizationColumnExists = await hasColumn("user_profiles", "organization");
    const result = organizationColumnExists
      ? await databasePool.query(
          `
            insert into user_profiles (user_id, full_name, role, account_status, organization)
            values ($1, $2, 'business_owner', 'pending', null)
            returning *
          `,
          [input.userId, input.fullName]
        )
      : await databasePool.query(
          `
            insert into user_profiles (user_id, full_name, role, account_status)
            values ($1, $2, 'business_owner', 'pending')
            returning *
          `,
          [input.userId, input.fullName]
        );

    return mapUserProfile(result.rows[0] as Record<string, unknown>);
  }

  public async findByUserId(userId: string): Promise<UserProfile | null> {
    const result = await databasePool.query(
      `
        select *
        from user_profiles
        where user_id = $1
      `,
      [userId]
    );

    return result.rowCount ? mapUserProfile(result.rows[0] as Record<string, unknown>) : null;
  }
}
