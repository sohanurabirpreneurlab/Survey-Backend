import type { CreateOrganizationInput, Organization, OrganizationMembership } from "./organization.types";

export interface IOrganizationRepository {
  createOrganizationWithOwner(input: CreateOrganizationInput): Promise<Organization>;
  findById(organizationId: string): Promise<Organization | null>;
  findMembership(organizationId: string, userId: string): Promise<OrganizationMembership | null>;
}
