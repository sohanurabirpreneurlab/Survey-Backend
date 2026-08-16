import { AppError } from "../../common/errors/app-error";
import { ERROR_CODES } from "../../common/errors/error-codes";
import { logger } from "../../common/utils/logger";
import { AuthRepository } from "../auth/auth.repository";
import type { IAuthRepository } from "../auth/auth.repository.interface";
import { InvitationService } from "../invitations/invitation.service";
import { OrganizationService } from "../organizations/organization.service";
import { ResponseRepository } from "../responses/response.repository";
import type { IResponseRepository } from "../responses/response.repository.interface";
import { SurveyRepository } from "../surveys/survey.repository";
import type { ISurveyRepository } from "../surveys/survey.repository.interface";

export type ResolveExternalSurveyInvitationInput = {
  createdBy: string;
  email: string;
  requestId: string | null;
  surveyId: string;
};

export type ResolveExternalSurveyInvitationResult = {
  hasSubmitted: boolean;
  invitationStatus: "completed" | "pending";
  surveyDescription: string | null;
  surveyId: string;
  surveyLink: string | null;
  surveyName: string;
};

export class ExternalSurveyService {
  public constructor(
    private readonly authRepository: IAuthRepository = new AuthRepository(),
    private readonly invitationService = new InvitationService(),
    private readonly organizationService = new OrganizationService(),
    private readonly responseRepository: IResponseRepository = new ResponseRepository(),
    private readonly surveyRepository: ISurveyRepository = new SurveyRepository()
  ) {}

  public async resolveInvitation(
    input: ResolveExternalSurveyInvitationInput
  ): Promise<ResolveExternalSurveyInvitationResult> {
    const integrationUser = await this.authRepository.findUserByUserId(input.createdBy);

    if (!integrationUser || integrationUser.profile.accountStatus !== "approved") {
      throw new AppError(
        ERROR_CODES.integrationIdentityInactive,
        "The integration identity is not active.",
        403
      );
    }

    const survey = await this.surveyRepository.findSurveyById(input.surveyId);

    if (!survey || survey.deletedAt) {
      throw new AppError(ERROR_CODES.surveyNotFound, "Survey was not found.", 404);
    }

    const membership = await this.organizationService.requireOrganizationMembership(
      survey.organizationId,
      integrationUser.userId
    );
    this.organizationService.requireSurveyPublishPermission(membership);

    if (survey.accessMode !== "invite_only") {
      throw new AppError(
        ERROR_CODES.surveyInviteOnlyRequired,
        "Survey must be invite-only for this integration flow.",
        409
      );
    }

    if (survey.status !== "published" || !survey.publishedVersionId) {
      throw new AppError(
        ERROR_CODES.surveyNotPublished,
        "Survey must be published before invitations can be resolved.",
        409
      );
    }

    if (survey.opensAt && new Date(survey.opensAt).getTime() > Date.now()) {
      throw new AppError(ERROR_CODES.surveyNotOpenYet, "Survey is not open yet.", 409);
    }

    if (survey.closesAt && new Date(survey.closesAt).getTime() <= Date.now()) {
      throw new AppError(ERROR_CODES.surveyClosed, "Survey is closed.", 409);
    }

    const publishedVersion = await this.surveyRepository.findPublishedVersion(survey.id);

    if (!publishedVersion) {
      throw new AppError(
        ERROR_CODES.surveyNotPublished,
        "Survey must have a published version before invitations can be resolved.",
        409
      );
    }

    if (survey.responseLimit !== null) {
      const submittedCount = await this.responseRepository.countSubmittedResponsesBySurveyId(survey.id);

      if (submittedCount >= survey.responseLimit) {
        throw new AppError(
          ERROR_CODES.surveyNotAcceptingResponses,
          "Survey response limit has been reached.",
          409
        );
      }
    }

    const hasSubmitted = await this.invitationService.hasSubmittedInvitationResponse({
      recipientEmail: input.email,
      surveyId: survey.id
    });

    if (hasSubmitted) {
      this.logResolveResult(input, "completed");
      return {
        hasSubmitted: true,
        invitationStatus: "completed",
        surveyDescription: publishedVersion.description,
        surveyId: survey.id,
        surveyLink: null,
        surveyName: publishedVersion.title
      };
    }

    const issuedAccess = await this.invitationService.issueInvitationAccessLink({
      createdBy: integrationUser.userId,
      expiresAt: null,
      maxResponses: 1,
      metadata: { source: "external_integration" },
      recipientEmail: input.email,
      reuseExistingInvitation: true,
      surveyId: survey.id,
      surveyVersionId: publishedVersion.id
    });

    this.logResolveResult(input, "pending");
    return {
      hasSubmitted: false,
      invitationStatus: "pending",
      surveyDescription: publishedVersion.description,
      surveyId: survey.id,
      surveyLink: issuedAccess.invitationUrl,
      surveyName: publishedVersion.title
    };
  }

  private logResolveResult(
    input: ResolveExternalSurveyInvitationInput,
    result: "completed" | "pending"
  ): void {
    logger.info("External survey invitation resolved.", {
      integrationUserId: input.createdBy,
      requestId: input.requestId,
      result,
      surveyId: input.surveyId
    });
  }
}
