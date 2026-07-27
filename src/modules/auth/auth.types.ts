export type AccountStatus = "pending" | "approved" | "rejected" | "suspended";
export type UserRole = "business_owner" | "admin";
export type AccessState = "approved" | "pending_approval" | "rejected" | "suspended";
export type OrganizationMembershipRole = "owner" | "admin" | "editor" | "analyst" | "viewer";

export type UserProfile = {
  userId: string;
  fullName: string;
  role: UserRole;
  accountStatus: AccountStatus;
  organization: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  suspendedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthUserDto = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  accountStatus: AccountStatus;
};

export type AuthOrganizationDto = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  membershipRole: OrganizationMembershipRole;
};

export type RegisterInput = {
  email: string;
  password: string;
  fullName: string;
  organizationId: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type RegisterResult = {
  emailVerificationRequired: boolean;
  isPlatformAdmin: boolean;
  organizations: AuthOrganizationDto[];
  platformRole: UserRole;
  requiresApproval: boolean;
  user: AuthUserDto;
};

export type LoginResult = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  accessState: AccessState;
  isPlatformAdmin: boolean;
  organizations: AuthOrganizationDto[];
  platformRole: UserRole;
  requiresApproval: boolean;
  user: AuthUserDto;
};

export type CurrentUserResult = {
  accessState: AccessState;
  isPlatformAdmin: boolean;
  organizations: AuthOrganizationDto[];
  platformRole: UserRole;
  requiresApproval: boolean;
  user: AuthUserDto;
};
