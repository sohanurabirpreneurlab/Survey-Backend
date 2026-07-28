import type { AccountStatus, OrganizationMembershipRole, UserRole } from "../auth/auth.types";

export type AdminUserSummary = {
  accountStatus: AccountStatus;
  createdAt: string;
  email: string;
  fullName: string;
  organizationId: string | null;
  organizationName: string | null;
  platformRole: UserRole;
  updatedAt: string;
  userId: string;
};

export type AdminUserDetail = AdminUserSummary & {
  approvedAt: string | null;
  memberships: Array<{
    membershipRole: OrganizationMembershipRole;
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
  }>;
  rejectedAt: string | null;
  suspendedAt: string | null;
};

export type AdminUsersListResult = {
  items: AdminUserSummary[];
  limit: number;
  page: number;
  total: number;
  totalPages: number;
};

export type AuditLogRecord = {
  action: string;
  actorEmail: string | null;
  actorName: string | null;
  actorUserId: string | null;
  createdAt: string;
  id: string;
  metadata: Record<string, unknown>;
  result: "failure" | "success";
  targetId: string | null;
  targetLabel: string | null;
  targetType: string;
};

export type AuditLogsResult = {
  items: AuditLogRecord[];
  limit: number;
  page: number;
  total: number;
  totalPages: number;
};

export type AdminDashboardSummary = {
  activeSurveys: number;
  approvedUsers: number;
  organizations: number;
  pendingApprovals: number;
  recentActivity: AuditLogRecord[];
  recentApprovals: AdminUserSummary[];
  recentPendingUsers: AdminUserSummary[];
  suspendedUsers: number;
};

export type AdminOrganizationSummary = {
  createdAt: string;
  memberCount: number;
  name: string;
  organizationId: string;
  ownerEmail: string | null;
  ownerName: string | null;
  surveyCount: number;
  updatedAt: string;
};

export type AdminOrganizationsListResult = {
  items: AdminOrganizationSummary[];
  limit: number;
  page: number;
  total: number;
  totalPages: number;
};

export type AdminOrganizationDetail = {
  createdAt: string;
  members: Array<{
    accountStatus: AccountStatus;
    email: string;
    fullName: string;
    membershipRole: OrganizationMembershipRole;
    platformRole: UserRole;
    userId: string;
  }>;
  name: string;
  organizationId: string;
  owner: {
    accountStatus: AccountStatus;
    email: string | null;
    fullName: string | null;
    membershipRole: OrganizationMembershipRole | null;
    userId: string | null;
  };
  slug: string;
  surveySummary: {
    closed: number;
    draft: number;
    published: number;
    total: number;
  };
  updatedAt: string;
};

export type ApproveUserResult = {
  membership: {
    role: OrganizationMembershipRole;
  };
  organization: {
    id: string;
    name: string;
  };
  user: {
    accountStatus: AccountStatus;
    email: string;
    id: string;
  };
};

export type UpdateUserRoleResult = {
  user: {
    id: string;
    platformRole: UserRole;
  };
};

export type UpdateAdminUserProfileResult = {
  user: AdminUserDetail;
};

export type CreateAdminOrganizationResult = {
  organization: {
    id: string;
    name: string;
    slug: string;
  };
};
