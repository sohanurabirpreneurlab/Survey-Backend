import { AppError } from "../../common/errors/app-error";
import { ERROR_CODES } from "../../common/errors/error-codes";
import { AuthRepository } from "../auth/auth.repository";
import { decryptEmail } from "../../common/security/email-protection";
import { OrganizationService } from "../organizations/organization.service";
import { SurveyRepository } from "../surveys/survey.repository";
import type { ISurveyRepository } from "../surveys/survey.repository.interface";
import type { SurveyVersionDefinition } from "../surveys/survey.types";
import { SurveyTrackingRepository } from "./survey-tracking.repository";
import type { ISurveyTrackingRepository } from "./survey-tracking.repository.interface";

export class SurveyTrackingService {
  public constructor(
    private readonly trackingRepository: ISurveyTrackingRepository = new SurveyTrackingRepository(),
    private readonly surveyRepository: ISurveyRepository = new SurveyRepository(),
    private readonly authRepository = new AuthRepository(),
    private readonly organizationService = new OrganizationService()
  ) {}

  public async listTrackedSurveys(userId: string, page: number, limit: number) {
    const scope = await this.resolveOrganizationScope(userId);
    return this.trackingRepository.listTrackedSurveys({
      limit,
      organizationIds: scope.organizationIds,
      page
    });
  }

  public async listInvitationRecipients(surveyId: string, userId: string) {
    await this.assertCanReadSurvey(surveyId, userId);
    const invitations = await this.trackingRepository.listInvitationRecipients(surveyId);
    return invitations.map((invitation) => ({
      ...invitation,
      email: invitation.email ? decryptEmail(invitation.email) : null
    }));
  }

  public async listSurveyResponses(surveyId: string, userId: string) {
    await this.assertCanReadSurvey(surveyId, userId);
    const responses = await this.trackingRepository.listSurveyResponses(surveyId);
    return responses.map((response) => ({
      ...response,
      respondentEmail: response.respondentEmail ? decryptEmail(response.respondentEmail) : null
    }));
  }

  public async getResponsePreview(surveyId: string, responseId: string, userId: string) {
    await this.assertCanReadSurvey(surveyId, userId);
    const preview = await this.trackingRepository.getResponsePreview(surveyId, responseId);

    if (!preview) {
      throw new AppError(ERROR_CODES.responseNotFound, "Response was not found.", 404);
    }

    const definition = await this.getDefinition(preview.response.surveyVersionId);

    return {
      answers: preview.answers,
      definition,
      response: {
        ...preview.response,
        respondentEmail: preview.response.respondentEmail
          ? decryptEmail(preview.response.respondentEmail)
          : null
      },
      survey: preview.survey
    };
  }

  private async getDefinition(surveyVersionId: string): Promise<SurveyVersionDefinition> {
    const definition = await this.surveyRepository.getVersionDefinition(surveyVersionId);

    if (!definition) {
      throw new AppError(ERROR_CODES.versionNotFound, "Survey version was not found.", 404);
    }

    return definition;
  }

  private async assertCanReadSurvey(surveyId: string, userId: string): Promise<void> {
    const survey = await this.surveyRepository.findSurveyById(surveyId);

    if (!survey) {
      throw new AppError(ERROR_CODES.surveyNotFound, "Survey was not found.", 404);
    }

    const scope = await this.resolveOrganizationScope(userId);

    if (scope.isAdmin) {
      return;
    }

    const membership = await this.organizationService.requireOrganizationMembership(survey.organizationId, userId);
    this.organizationService.requireSurveyReadPermission(membership);
  }

  private async resolveOrganizationScope(userId: string): Promise<{ isAdmin: boolean; organizationIds?: string[] }> {
    const account = await this.authRepository.findUserByUserId(userId);

    if (!account) {
      throw new AppError(ERROR_CODES.userProfileNotFound, "Account profile is missing.", 403);
    }

    if (account.profile.role === "admin") {
      return { isAdmin: true };
    }

    const memberships = await this.organizationService.listOrganizationsForUser(userId);
    const organizationIds = memberships
      .filter((membership) => membership.permissions.canReadSurvey)
      .map((membership) => membership.organization.id);

    return {
      isAdmin: false,
      organizationIds
    };
  }
}
