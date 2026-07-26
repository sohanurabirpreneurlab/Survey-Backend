export const ORGANIZATION_ROLES = ["owner", "admin", "editor", "analyst", "viewer"] as const;

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export type Organization = {
  id: string;
  name: string;
  slug: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type OrganizationMembership = {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  createdAt: string;
  updatedAt: string;
};

export type CreateOrganizationInput = {
  name: string;
  slug: string;
  ownerUserId: string;
};

export type OrganizationPermissions = {
  canCreateSurvey: boolean;
  canEditDraft: boolean;
  canPublishSurvey: boolean;
  canManageMembers: boolean;
  canCloseSurvey: boolean;
  canReadSurvey: boolean;
};
