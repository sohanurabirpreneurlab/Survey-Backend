import { AppError } from "../../common/errors/app-error";
import { ERROR_CODES } from "../../common/errors/error-codes";
import { getOrganizationPermissions } from "./organization.permissions";
import { OrganizationRepository } from "./organization.repository";
import type { IOrganizationRepository } from "./organization.repository.interface";
import type { CreateOrganizationInput, Organization, OrganizationMembership } from "./organization.types";

export class OrganizationService {
  public constructor(
    private readonly organizationRepository: IOrganizationRepository = new OrganizationRepository()
  ) {}

  public async createOrganization(input: CreateOrganizationInput): Promise<Organization> {
    return this.organizationRepository.createOrganizationWithOwner(input);
  }

  public async listPublicOrganizations() {
    return this.organizationRepository.listPublicOrganizations();
  }

  public async listOrganizationsForUser(userId: string) {
    return this.organizationRepository.listMembershipsByUserId(userId);
  }

  public async getOrganization(organizationId: string, userId: string): Promise<Organization> {
    const organization = await this.organizationRepository.findById(organizationId);

    if (!organization) {
      throw new AppError(ERROR_CODES.organizationNotFound, "Organization was not found.", 404);
    }

    await this.requireOrganizationMembership(organizationId, userId);
    return organization;
  }

  public async requireOrganizationMembership(
    organizationId: string,
    userId: string
  ): Promise<OrganizationMembership> {
    const membership = await this.organizationRepository.findMembership(organizationId, userId);

    if (!membership) {
      throw new AppError(
        ERROR_CODES.organizationMembershipRequired,
        "You must belong to this organization.",
        403
      );
    }

    return membership;
  }

  public requireSurveyCreatePermission(membership: OrganizationMembership): void {
    if (!getOrganizationPermissions(membership).canCreateSurvey) {
      throw new AppError(
        ERROR_CODES.insufficientOrganizationRole,
        "Your role does not allow survey creation.",
        403
      );
    }
  }

  public requireSurveyEditPermission(membership: OrganizationMembership): void {
    if (!getOrganizationPermissions(membership).canEditDraft) {
      throw new AppError(
        ERROR_CODES.insufficientOrganizationRole,
        "Your role does not allow draft editing.",
        403
      );
    }
  }

  public requireSurveyPublishPermission(membership: OrganizationMembership): void {
    if (!getOrganizationPermissions(membership).canPublishSurvey) {
      throw new AppError(
        ERROR_CODES.insufficientOrganizationRole,
        "Your role does not allow survey publishing.",
        403
      );
    }
  }

  public requireSurveyLifecyclePermission(membership: OrganizationMembership): void {
    if (!getOrganizationPermissions(membership).canCloseSurvey) {
      throw new AppError(
        ERROR_CODES.insufficientOrganizationRole,
        "Your role does not allow survey lifecycle changes.",
        403
      );
    }
  }

  public requireSurveyReadPermission(membership: OrganizationMembership): void {
    if (!getOrganizationPermissions(membership).canReadSurvey) {
      throw new AppError(ERROR_CODES.forbidden, "Your role does not allow survey access.", 403);
    }
  }
}
