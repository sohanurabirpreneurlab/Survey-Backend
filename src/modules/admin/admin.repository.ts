import { AppError } from "../../common/errors/app-error";
import { ERROR_CODES } from "../../common/errors/error-codes";
import { hasColumn } from "../../common/utils/schema-capabilities";
import { databasePool } from "../../config/database";
import type {
  CreateAdminOrganizationResult,
  AdminDashboardSummary,
  AdminOrganizationDetail,
  AdminOrganizationSummary,
  AdminOrganizationsListResult,
  AdminUserDetail,
  AdminUserSummary,
  AdminUsersListResult,
  AuditLogRecord,
  AuditLogsResult,
  ApproveUserResult,
  UpdateUserRoleResult
} from "./admin.types";

type DatabaseClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>;
  release: () => void;
};

const withTransaction = async <T>(callback: (client: DatabaseClient) => Promise<T>): Promise<T> => {
  const client = await databasePool.connect();

  try {
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
};

const buildPagination = (page: number, limit: number, total: number) => ({
  limit,
  page,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit))
});

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

const buildAdminUserQueryFragments = async () => {
  const hasProfileOrganization = await hasColumn("user_profiles", "organization");

  return {
    profileOrganizationJoin: hasProfileOrganization
      ? "left join organizations profile_org on profile_org.id = up.organization and profile_org.deleted_at is null"
      : "",
    profileOrganizationSelect: hasProfileOrganization
      ? "profile_org.id as profile_organization_id, profile_org.name as profile_organization_name,"
      : "null::uuid as profile_organization_id, null::text as profile_organization_name,",
  };
};

const mapAuditLog = (row: Record<string, unknown>): AuditLogRecord => ({
  action: String(row.action),
  actorEmail: row.actor_email ? String(row.actor_email) : null,
  actorName: row.actor_name ? String(row.actor_name) : null,
  actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
  createdAt: String(row.created_at),
  id: String(row.id),
  metadata: (row.metadata as Record<string, unknown>) ?? {},
  result: row.result as AuditLogRecord["result"],
  targetId: row.target_id ? String(row.target_id) : null,
  targetLabel: row.target_label ? String(row.target_label) : null,
  targetType: String(row.target_type)
});

const mapAdminUserSummary = (row: Record<string, unknown>): AdminUserSummary => ({
  accountStatus: row.account_status as AdminUserSummary["accountStatus"],
  createdAt: String(row.created_at),
  email: String(row.email),
  fullName: String(row.full_name),
  organizationId: row.organization_id
    ? String(row.organization_id)
    : row.profile_organization_id
      ? String(row.profile_organization_id)
      : null,
  organizationName: row.organization_name
    ? String(row.organization_name)
    : row.profile_organization_name
      ? String(row.profile_organization_name)
      : null,
  platformRole: row.role as AdminUserSummary["platformRole"],
  updatedAt: String(row.updated_at),
  userId: String(row.user_id)
});

export class AdminRepository {
  public async getDashboardSummary(): Promise<AdminDashboardSummary> {
    const fragments = await buildAdminUserQueryFragments();
    const [userCounts, organizationCounts, surveyCounts, recentPendingUsers, recentApprovals, recentActivity] =
      await Promise.all([
        databasePool.query(
          `
            select
              count(*) filter (where account_status = 'pending')::int as pending_approvals,
              count(*) filter (where account_status = 'approved')::int as approved_users,
              count(*) filter (where account_status = 'suspended')::int as suspended_users
            from user_profiles
          `
        ),
        databasePool.query(`select count(*)::int as organizations from organizations where deleted_at is null`),
        databasePool.query(
          `select count(*)::int as active_surveys from surveys where deleted_at is null and status in ('draft', 'published')`
        ),
        databasePool.query(
          `
            select
              up.user_id,
              up.full_name,
              up.role,
              up.account_status,
              up.created_at,
              up.updated_at,
              u.email,
              ${fragments.profileOrganizationSelect}
              o.id as organization_id,
              o.name as organization_name
            from user_profiles up
            inner join app_users u on u.id = up.user_id
            left join organization_members om on om.user_id = up.user_id
            left join organizations o on o.id = om.organization_id and o.deleted_at is null
            ${fragments.profileOrganizationJoin}
            where up.account_status = 'pending'
            order by up.created_at desc
            limit 5
          `
        ),
        databasePool.query(
          `
            select
              up.user_id,
              up.full_name,
              up.role,
              up.account_status,
              up.created_at,
              up.updated_at,
              u.email,
              ${fragments.profileOrganizationSelect}
              o.id as organization_id,
              o.name as organization_name
            from user_profiles up
            inner join app_users u on u.id = up.user_id
            left join organization_members om on om.user_id = up.user_id
            left join organizations o on o.id = om.organization_id and o.deleted_at is null
            ${fragments.profileOrganizationJoin}
            where up.account_status = 'approved'
            order by up.approved_at desc nulls last
            limit 5
          `
        ),
        databasePool.query(
          `
            select
              al.*,
              actor.email as actor_email,
              actor_profile.full_name as actor_name
            from audit_logs al
            left join app_users actor on actor.id = al.actor_user_id
            left join user_profiles actor_profile on actor_profile.user_id = al.actor_user_id
            order by al.created_at desc
            limit 10
          `
        )
      ]);

    const userCountRow = userCounts.rows[0] as Record<string, unknown>;
    const orgCountRow = organizationCounts.rows[0] as Record<string, unknown>;
    const surveyCountRow = surveyCounts.rows[0] as Record<string, unknown>;

    return {
      activeSurveys: Number(surveyCountRow.active_surveys ?? 0),
      approvedUsers: Number(userCountRow.approved_users ?? 0),
      organizations: Number(orgCountRow.organizations ?? 0),
      pendingApprovals: Number(userCountRow.pending_approvals ?? 0),
      recentActivity: recentActivity.rows.map((row: unknown) => mapAuditLog(row as Record<string, unknown>)),
      recentApprovals: recentApprovals.rows.map((row: unknown) => mapAdminUserSummary(row as Record<string, unknown>)),
      recentPendingUsers: recentPendingUsers.rows.map((row: unknown) => mapAdminUserSummary(row as Record<string, unknown>)),
      suspendedUsers: Number(userCountRow.suspended_users ?? 0)
    };
  }

  public async listUsers(input: {
    limit: number;
    page: number;
    query?: string;
    status?: "approved" | "pending" | "rejected" | "suspended";
  }): Promise<AdminUsersListResult> {
    const fragments = await buildAdminUserQueryFragments();
    const offset = (input.page - 1) * input.limit;
    const filters: string[] = [];
    const params: unknown[] = [];

    if (input.status) {
      params.push(input.status);
      filters.push(`up.account_status = $${params.length}`);
    }

    if (input.query?.trim()) {
      params.push(`%${input.query.trim().toLowerCase()}%`);
      filters.push(`(lower(up.full_name) like $${params.length} or lower(u.email) like $${params.length})`);
    }

    const whereClause = filters.length > 0 ? `where ${filters.join(" and ")}` : "";

    params.push(input.limit);
    const limitIndex = params.length;
    params.push(offset);
    const offsetIndex = params.length;

    const rowsResult = await databasePool.query(
      `
        select
          up.user_id,
          up.full_name,
          up.role,
          up.account_status,
          up.created_at,
          up.updated_at,
          u.email,
          ${fragments.profileOrganizationSelect}
          o.id as organization_id,
          o.name as organization_name
        from user_profiles up
        inner join app_users u on u.id = up.user_id
        left join organization_members om on om.user_id = up.user_id
        left join organizations o on o.id = om.organization_id and o.deleted_at is null
        ${fragments.profileOrganizationJoin}
        ${whereClause}
        order by up.created_at desc
        limit $${limitIndex} offset $${offsetIndex}
      `,
      params
    );

    const countParams = params.slice(0, params.length - 2);
    const countResult = await databasePool.query(
      `
        select count(*)::int as total
        from user_profiles up
        inner join app_users u on u.id = up.user_id
        ${whereClause}
      `,
      countParams
    );

    const total = Number((countResult.rows[0] as Record<string, unknown>).total ?? 0);

    return {
      items: rowsResult.rows.map((row: unknown) => mapAdminUserSummary(row as Record<string, unknown>)),
      ...buildPagination(input.page, input.limit, total)
    };
  }

  public async getUserById(userId: string): Promise<AdminUserDetail | null> {
    const fragments = await buildAdminUserQueryFragments();
    const [userResult, membershipsResult] = await Promise.all([
      databasePool.query(
        `
          select
            up.user_id,
            up.full_name,
            up.role,
            up.account_status,
            up.created_at,
            up.updated_at,
            up.approved_at,
            up.rejected_at,
            up.suspended_at,
            u.email,
            ${fragments.profileOrganizationSelect}
            o.id as organization_id,
            o.name as organization_name
          from user_profiles up
          inner join app_users u on u.id = up.user_id
          left join organization_members om on om.user_id = up.user_id
          left join organizations o on o.id = om.organization_id and o.deleted_at is null
          ${fragments.profileOrganizationJoin}
          where up.user_id = $1
          limit 1
        `,
        [userId]
      ),
      databasePool.query(
        `
          select
            om.role as membership_role,
            o.id as organization_id,
            o.name as organization_name,
            o.slug as organization_slug
          from organization_members om
          inner join organizations o on o.id = om.organization_id
          where om.user_id = $1 and o.deleted_at is null
          order by o.created_at asc
        `,
        [userId]
      )
    ]);

    if (!userResult.rowCount) {
      return null;
    }

    const row = userResult.rows[0] as Record<string, unknown>;
    const summary = mapAdminUserSummary(row);

    return {
      ...summary,
      approvedAt: row.approved_at ? String(row.approved_at) : null,
      memberships: membershipsResult.rows.map((membership: unknown) => ({
        membershipRole: (membership as Record<string, unknown>).membership_role as AdminUserDetail["memberships"][number]["membershipRole"],
        organizationId: String((membership as Record<string, unknown>).organization_id),
        organizationName: String((membership as Record<string, unknown>).organization_name),
        organizationSlug: String((membership as Record<string, unknown>).organization_slug)
      })),
      rejectedAt: row.rejected_at ? String(row.rejected_at) : null,
      suspendedAt: row.suspended_at ? String(row.suspended_at) : null
    };
  }

  public async listAuditLogs(input: {
    action?: string;
    limit: number;
    page: number;
    targetType?: string;
  }): Promise<AuditLogsResult> {
    const offset = (input.page - 1) * input.limit;
    const filters: string[] = [];
    const params: unknown[] = [];

    if (input.action) {
      params.push(input.action);
      filters.push(`al.action = $${params.length}`);
    }

    if (input.targetType) {
      params.push(input.targetType);
      filters.push(`al.target_type = $${params.length}`);
    }

    const whereClause = filters.length > 0 ? `where ${filters.join(" and ")}` : "";

    params.push(input.limit);
    const limitIndex = params.length;
    params.push(offset);
    const offsetIndex = params.length;

    const rowsResult = await databasePool.query(
      `
        select
          al.*,
          actor.email as actor_email,
          actor_profile.full_name as actor_name
        from audit_logs al
        left join app_users actor on actor.id = al.actor_user_id
        left join user_profiles actor_profile on actor_profile.user_id = al.actor_user_id
        ${whereClause}
        order by al.created_at desc
        limit $${limitIndex} offset $${offsetIndex}
      `,
      params
    );

    const countResult = await databasePool.query(
      `select count(*)::int as total from audit_logs al ${whereClause}`,
      params.slice(0, params.length - 2)
    );

    const total = Number((countResult.rows[0] as Record<string, unknown>).total ?? 0);

    return {
      items: rowsResult.rows.map((row: unknown) => mapAuditLog(row as Record<string, unknown>)),
      ...buildPagination(input.page, input.limit, total)
    };
  }

  public async listOrganizations(input: {
    limit: number;
    page: number;
    query?: string;
  }): Promise<AdminOrganizationsListResult> {
    const offset = (input.page - 1) * input.limit;
    const params: unknown[] = [];
    const filters = ["o.deleted_at is null"];

    if (input.query?.trim()) {
      params.push(`%${input.query.trim().toLowerCase()}%`);
      filters.push(`(lower(o.name) like $${params.length} or lower(owner_user.email) like $${params.length})`);
    }

    params.push(input.limit);
    const limitIndex = params.length;
    params.push(offset);
    const offsetIndex = params.length;
    const whereClause = `where ${filters.join(" and ")}`;

    const rowsResult = await databasePool.query(
      `
        select
          o.id as organization_id,
          o.name,
          o.created_at,
          o.updated_at,
          owner_user.email as owner_email,
          owner_profile.full_name as owner_name,
          count(distinct om.user_id)::int as member_count,
          count(distinct s.id)::int as survey_count
        from organizations o
        left join organization_members om on om.organization_id = o.id
        left join organization_members owner_member on owner_member.organization_id = o.id and owner_member.role = 'owner'
        left join app_users owner_user on owner_user.id = owner_member.user_id
        left join user_profiles owner_profile on owner_profile.user_id = owner_member.user_id
        left join surveys s on s.organization_id = o.id and s.deleted_at is null
        ${whereClause}
        group by o.id, owner_user.email, owner_profile.full_name
        order by o.created_at desc
        limit $${limitIndex} offset $${offsetIndex}
      `,
      params
    );

    const countResult = await databasePool.query(
      `select count(*)::int as total from organizations o ${whereClause}`,
      params.slice(0, params.length - 2)
    );

    const total = Number((countResult.rows[0] as Record<string, unknown>).total ?? 0);

    return {
      items: rowsResult.rows.map((row: unknown) => ({
        createdAt: String((row as Record<string, unknown>).created_at),
        memberCount: Number((row as Record<string, unknown>).member_count ?? 0),
        name: String((row as Record<string, unknown>).name),
        organizationId: String((row as Record<string, unknown>).organization_id),
        ownerEmail: (row as Record<string, unknown>).owner_email ? String((row as Record<string, unknown>).owner_email) : null,
        ownerName: (row as Record<string, unknown>).owner_name ? String((row as Record<string, unknown>).owner_name) : null,
        surveyCount: Number((row as Record<string, unknown>).survey_count ?? 0),
        updatedAt: String((row as Record<string, unknown>).updated_at)
      })),
      ...buildPagination(input.page, input.limit, total)
    };
  }

  public async getOrganizationById(organizationId: string): Promise<AdminOrganizationDetail | null> {
    const [organizationResult, membersResult, surveySummaryResult] = await Promise.all([
      databasePool.query(
        `
          select *
          from organizations
          where id = $1 and deleted_at is null
        `,
        [organizationId]
      ),
      databasePool.query(
        `
          select
            om.role as membership_role,
            u.id as user_id,
            u.email,
            up.full_name,
            up.account_status,
            up.role as platform_role
          from organization_members om
          inner join app_users u on u.id = om.user_id
          inner join user_profiles up on up.user_id = u.id
          where om.organization_id = $1
          order by case when om.role = 'owner' then 0 else 1 end, up.full_name asc
        `,
        [organizationId]
      ),
      databasePool.query(
        `
          select
            count(*)::int as total,
            count(*) filter (where status = 'draft')::int as draft,
            count(*) filter (where status = 'published')::int as published,
            count(*) filter (where status = 'closed')::int as closed
          from surveys
          where organization_id = $1 and deleted_at is null
        `,
        [organizationId]
      )
    ]);

    if (!organizationResult.rowCount) {
      return null;
    }

    const organization = organizationResult.rows[0] as Record<string, unknown>;
    const ownerMember = membersResult.rows.find(
      (member: unknown) => (member as Record<string, unknown>).membership_role === "owner"
    ) as Record<string, unknown> | undefined;
    const surveySummary = surveySummaryResult.rows[0] as Record<string, unknown>;

    return {
      createdAt: String(organization.created_at),
      members: membersResult.rows.map((member: unknown) => ({
        accountStatus: (member as Record<string, unknown>).account_status as AdminOrganizationDetail["members"][number]["accountStatus"],
        email: String((member as Record<string, unknown>).email),
        fullName: String((member as Record<string, unknown>).full_name),
        membershipRole: (member as Record<string, unknown>).membership_role as AdminOrganizationDetail["members"][number]["membershipRole"],
        platformRole: (member as Record<string, unknown>).platform_role as AdminOrganizationDetail["members"][number]["platformRole"],
        userId: String((member as Record<string, unknown>).user_id)
      })),
      name: String(organization.name),
      organizationId: String(organization.id),
      owner: {
        accountStatus: ownerMember?.account_status as AdminOrganizationDetail["owner"]["accountStatus"] ?? null,
        email: ownerMember?.email ? String(ownerMember.email) : null,
        fullName: ownerMember?.full_name ? String(ownerMember.full_name) : null,
        membershipRole: ownerMember?.membership_role as AdminOrganizationDetail["owner"]["membershipRole"] ?? null,
        userId: ownerMember?.user_id ? String(ownerMember.user_id) : null
      },
      slug: String(organization.slug),
      surveySummary: {
        closed: Number(surveySummary.closed ?? 0),
        draft: Number(surveySummary.draft ?? 0),
        published: Number(surveySummary.published ?? 0),
        total: Number(surveySummary.total ?? 0)
      },
      updatedAt: String(organization.updated_at)
    };
  }

  public async approveUser(input: {
    actorUserId: string;
    organizationName: string;
    userId: string;
  }): Promise<ApproveUserResult> {
    const hasProfileOrganization = await hasColumn("user_profiles", "organization");
    const organizationName = input.organizationName.trim();

    if (!hasProfileOrganization && !organizationName) {
      throw new AppError(ERROR_CODES.organizationNameInvalid, "Enter a valid organization name.", 400);
    }

    return withTransaction(async (client) => {
      const userResult = await client.query(
        `
          select
            u.id,
            u.email,
            up.full_name,
            up.account_status,
            ${hasProfileOrganization ? "up.organization as profile_organization_id" : "null::uuid as profile_organization_id"}
          from app_users u
          inner join user_profiles up on up.user_id = u.id
          where u.id = $1
          for update
        `,
        [input.userId]
      );

      if (!userResult.rowCount) {
        throw new AppError(ERROR_CODES.userProfileNotFound, "User was not found.", 404);
      }

      const user = userResult.rows[0] as Record<string, unknown>;

      if (user.account_status !== "pending") {
        throw new AppError(ERROR_CODES.userNotPending, "This user is no longer waiting for approval.", 409);
      }

      const membershipResult = await client.query(
        `select 1 from organization_members where user_id = $1 limit 1`,
        [input.userId]
      );

      if (membershipResult.rowCount) {
        throw new AppError(
          ERROR_CODES.databaseConflict,
          "This user is already connected to an organization.",
          409
        );
      }

      let organization: Record<string, unknown>;
      const selectedOrganizationId = user.profile_organization_id ? String(user.profile_organization_id) : null;

      if (selectedOrganizationId) {
        const organizationResult = await client.query(
          `
            select id, name
            from organizations
            where id = $1 and deleted_at is null
            limit 1
          `,
          [selectedOrganizationId]
        );

        if (!organizationResult.rowCount) {
          throw new AppError(ERROR_CODES.organizationNotFound, "The selected organization was not found.", 404);
        }

        organization = organizationResult.rows[0] as Record<string, unknown>;
      } else {
        const baseSlug = slugify(organizationName);
        let organizationSlug = baseSlug || `organization-${String(input.userId).slice(0, 8)}`;
        const existingOrgResult = await client.query(
          `select 1 from organizations where slug = $1 and deleted_at is null limit 1`,
          [organizationSlug]
        );

        if (existingOrgResult.rowCount) {
          organizationSlug = `${organizationSlug}-${Math.random().toString(36).slice(2, 8)}`;
        }

        const organizationInsert = await client.query(
          `
            insert into organizations (name, slug, created_by)
            values ($1, $2, $3)
            returning id, name
          `,
          [organizationName, organizationSlug, input.actorUserId]
        );

        organization = organizationInsert.rows[0] as Record<string, unknown>;

        await this.insertAuditLog(client, {
          action: "ORGANIZATION_CREATED",
          actorUserId: input.actorUserId,
          metadata: { organizationName },
          result: "success",
          targetId: String(organization.id),
          targetLabel: String(organization.name),
          targetType: "organization"
        });
      }

      await client.query(
        `
          insert into organization_members (organization_id, user_id, role)
          values ($1, $2, 'owner')
        `,
        [organization.id, input.userId]
      );

      await client.query(
        `
          update user_profiles
          set role = 'business_owner',
              account_status = 'approved',
              approved_at = now(),
              rejected_at = null,
              suspended_at = null,
              updated_at = now()
          where user_id = $1
        `,
        [input.userId]
      );
      await this.insertAuditLog(client, {
        action: "MEMBERSHIP_CREATED",
        actorUserId: input.actorUserId,
        metadata: { membershipRole: "owner", organizationId: String(organization.id), userId: input.userId },
        result: "success",
        targetId: input.userId,
        targetLabel: String(user.email),
        targetType: "user"
      });
      await this.insertAuditLog(client, {
        action: "USER_APPROVED",
        actorUserId: input.actorUserId,
        metadata: { organizationId: String(organization.id), organizationName },
        result: "success",
        targetId: input.userId,
        targetLabel: String(user.email),
        targetType: "user"
      });

      return {
        membership: {
          role: "owner"
        },
        organization: {
          id: String(organization.id),
          name: String(organization.name)
        },
        user: {
          accountStatus: "approved",
          email: String(user.email),
          id: String(user.id)
        }
      };
    });
  }

  public async rejectUser(input: {
    actorUserId: string;
    reason: string | null;
    userId: string;
  }): Promise<void> {
    await withTransaction(async (client) => {
      const result = await client.query(
        `
          update user_profiles
          set account_status = 'rejected',
              rejected_at = now(),
              updated_at = now()
          where user_id = $1
            and account_status = 'pending'
          returning user_id
        `,
        [input.userId]
      );

      if (!result.rowCount) {
        throw new AppError(ERROR_CODES.userNotPending, "This user is no longer waiting for approval.", 409);
      }

      await this.insertAuditLog(client, {
        action: "USER_REJECTED",
        actorUserId: input.actorUserId,
        metadata: input.reason ? { reason: input.reason } : {},
        result: "success",
        targetId: input.userId,
        targetLabel: input.userId,
        targetType: "user"
      });
    });
  }

  public async suspendUser(input: {
    actorUserId: string;
    reason: string | null;
    userId: string;
  }): Promise<void> {
    await withTransaction(async (client) => {
      const result = await client.query(
        `
          update user_profiles
          set account_status = 'suspended',
              suspended_at = now(),
              updated_at = now()
          where user_id = $1
            and account_status = 'approved'
          returning user_id
        `,
        [input.userId]
      );

      if (!result.rowCount) {
        throw new AppError(ERROR_CODES.userAlreadySuspended, "Only approved users can be suspended.", 409);
      }

      await this.insertAuditLog(client, {
        action: "USER_SUSPENDED",
        actorUserId: input.actorUserId,
        metadata: input.reason ? { reason: input.reason } : {},
        result: "success",
        targetId: input.userId,
        targetLabel: input.userId,
        targetType: "user"
      });
    });
  }

  public async reactivateUser(input: { actorUserId: string; userId: string }): Promise<void> {
    await withTransaction(async (client) => {
      const result = await client.query(
        `
          update user_profiles
          set account_status = 'approved',
              suspended_at = null,
              updated_at = now()
          where user_id = $1
            and account_status = 'suspended'
          returning user_id
        `,
        [input.userId]
      );

      if (!result.rowCount) {
        throw new AppError(ERROR_CODES.validationError, "Only suspended users can be reactivated.", 409);
      }

      await this.insertAuditLog(client, {
        action: "USER_REACTIVATED",
        actorUserId: input.actorUserId,
        metadata: {},
        result: "success",
        targetId: input.userId,
        targetLabel: input.userId,
        targetType: "user"
      });
    });
  }

  public async updateUserRole(input: {
    actorUserId: string;
    platformRole: "admin" | "business_owner";
    userId: string;
  }): Promise<UpdateUserRoleResult> {
    return withTransaction(async (client) => {
      const result = await client.query(
        `
          update user_profiles
          set role = $2,
              updated_at = now()
          where user_id = $1
          returning user_id, role
        `,
        [input.userId, input.platformRole]
      );

      if (!result.rowCount) {
        throw new AppError(ERROR_CODES.userProfileNotFound, "User was not found.", 404);
      }

      await this.insertAuditLog(client, {
        action: "USER_ROLE_UPDATED",
        actorUserId: input.actorUserId,
        metadata: { platformRole: input.platformRole },
        result: "success",
        targetId: input.userId,
        targetLabel: input.userId,
        targetType: "user"
      });

      return {
        user: {
          id: input.userId,
          platformRole: (result.rows[0] as Record<string, unknown>).role as UpdateUserRoleResult["user"]["platformRole"]
        }
      };
    });
  }

  public async createOrganization(input: {
    actorUserId: string;
    name: string;
  }): Promise<CreateAdminOrganizationResult> {
    const organizationName = input.name.trim();

    if (!organizationName) {
      throw new AppError(ERROR_CODES.organizationNameInvalid, "Enter a valid organization name.", 400);
    }

    return withTransaction(async (client) => {
      let organizationSlug = slugify(organizationName) || `organization-${Date.now()}`;
      const existingOrgResult = await client.query(
        `select 1 from organizations where slug = $1 and deleted_at is null limit 1`,
        [organizationSlug]
      );

      if (existingOrgResult.rowCount) {
        organizationSlug = `${organizationSlug}-${Math.random().toString(36).slice(2, 8)}`;
      }

      const organizationInsert = await client.query(
        `
          insert into organizations (name, slug, created_by)
          values ($1, $2, $3)
          returning id, name, slug
        `,
        [organizationName, organizationSlug, input.actorUserId]
      );

      const organization = organizationInsert.rows[0] as Record<string, unknown>;

      await this.insertAuditLog(client, {
        action: "ORGANIZATION_CREATED",
        actorUserId: input.actorUserId,
        metadata: { organizationName, source: "admin_panel" },
        result: "success",
        targetId: String(organization.id),
        targetLabel: String(organization.name),
        targetType: "organization"
      });

      return {
        organization: {
          id: String(organization.id),
          name: String(organization.name),
          slug: String(organization.slug)
        }
      };
    });
  }

  public async listRecentAuditForUser(userId: string): Promise<AuditLogRecord[]> {
    const result = await databasePool.query(
      `
        select
          al.*,
          actor.email as actor_email,
          actor_profile.full_name as actor_name
        from audit_logs al
        left join app_users actor on actor.id = al.actor_user_id
        left join user_profiles actor_profile on actor_profile.user_id = al.actor_user_id
        where al.target_type = 'user' and al.target_id = $1
        order by al.created_at desc
        limit 20
      `,
      [userId]
    );

    return result.rows.map((row: unknown) => mapAuditLog(row as Record<string, unknown>));
  }

  public async listRecentAuditForOrganization(organizationId: string): Promise<AuditLogRecord[]> {
    const result = await databasePool.query(
      `
        select
          al.*,
          actor.email as actor_email,
          actor_profile.full_name as actor_name
        from audit_logs al
        left join app_users actor on actor.id = al.actor_user_id
        left join user_profiles actor_profile on actor_profile.user_id = al.actor_user_id
        where al.target_type = 'organization' and al.target_id = $1
        order by al.created_at desc
        limit 20
      `,
      [organizationId]
    );

    return result.rows.map((row: unknown) => mapAuditLog(row as Record<string, unknown>));
  }

  private async insertAuditLog(
    client: DatabaseClient,
    input: {
      action: string;
      actorUserId: string | null;
      metadata: Record<string, unknown>;
      result: "failure" | "success";
      targetId: string | null;
      targetLabel: string | null;
      targetType: string;
    }
  ): Promise<void> {
    await client.query(
      `
        insert into audit_logs (actor_user_id, action, target_type, target_id, target_label, result, metadata)
        values ($1, $2, $3, $4, $5, $6, $7::jsonb)
      `,
      [
        input.actorUserId,
        input.action,
        input.targetType,
        input.targetId,
        input.targetLabel,
        input.result,
        JSON.stringify(input.metadata)
      ]
    );
  }
}
