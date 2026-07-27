import type {
  CreateOrganizationInput,
  Organization,
  OrganizationMembership,
  OrganizationMembershipSummary,
  PublicOrganizationOption
} from "./organization.types";

export interface IOrganizationRepository {
  createOrganizationWithOwner(input: CreateOrganizationInput): Promise<Organization>;
  findById(organizationId: string): Promise<Organization | null>;
  findMembership(organizationId: string, userId: string): Promise<OrganizationMembership | null>;
  listMembershipsByUserId(userId: string): Promise<OrganizationMembershipSummary[]>;
  listPublicOrganizations(): Promise<PublicOrganizationOption[]>;
}
