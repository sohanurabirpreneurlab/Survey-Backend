import type { OrganizationMembership, OrganizationPermissions, OrganizationRole } from "./organization.types";

const rolePermissions: Record<OrganizationRole, OrganizationPermissions> = {
  owner: {
    canCloseSurvey: true,
    canCreateSurvey: true,
    canEditDraft: true,
    canManageMembers: true,
    canPublishSurvey: true,
    canReadSurvey: true
  },
  admin: {
    canCloseSurvey: true,
    canCreateSurvey: true,
    canEditDraft: true,
    canManageMembers: false,
    canPublishSurvey: true,
    canReadSurvey: true
  },
  editor: {
    canCloseSurvey: false,
    canCreateSurvey: true,
    canEditDraft: true,
    canManageMembers: false,
    canPublishSurvey: false,
    canReadSurvey: true
  },
  analyst: {
    canCloseSurvey: false,
    canCreateSurvey: false,
    canEditDraft: false,
    canManageMembers: false,
    canPublishSurvey: false,
    canReadSurvey: true
  },
  viewer: {
    canCloseSurvey: false,
    canCreateSurvey: false,
    canEditDraft: false,
    canManageMembers: false,
    canPublishSurvey: false,
    canReadSurvey: true
  }
};

export const getOrganizationPermissions = (
  membership: OrganizationMembership
): OrganizationPermissions => rolePermissions[membership.role];
