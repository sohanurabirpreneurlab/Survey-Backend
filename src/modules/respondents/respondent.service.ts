import { AppError } from "../../common/errors/app-error";
import { ERROR_CODES } from "../../common/errors/error-codes";
import { createSecureToken, hashToken } from "../../common/security/token-hash";
import { env } from "../../config/env";
import { InvitationRepository } from "../invitations/invitation.repository";
import type { IInvitationRepository } from "../invitations/invitation.repository.interface";
import type { SurveyInvitation } from "../invitations/invitation.types";
import { OrganizationRepository } from "../organizations/organization.repository";
import { SurveyRepository } from "../surveys/survey.repository";
import type { ISurveyRepository } from "../surveys/survey.repository.interface";
import type { Survey } from "../surveys/survey.types";
import { RespondentRepository } from "./respondent.repository";
import type { IRespondentRepository } from "./respondent.repository.interface";
import type { PublicSurvey } from "./respondent.types";

export class RespondentService {
  public constructor(
    private readonly invitationRepository: IInvitationRepository = new InvitationRepository(),
    private readonly respondentRepository: IRespondentRepository = new RespondentRepository(),
    private readonly surveyRepository: ISurveyRepository = new SurveyRepository(),
    private readonly organizationRepository = new OrganizationRepository()
  ) {}

  public async grantAccessByInvitationToken(rawToken: string): Promise<{
    rawSessionToken: string;
    survey: PublicSurvey;
  }> {
    if (!env.respondentSessionTtlMinutes) {
      throw new AppError(
        ERROR_CODES.internalServerError,
        "Respondent sessions are not configured.",
        503
      );
    }

    const invitation = await this.invitationRepository.findInvitationByTokenHash(hashToken(rawToken));

    if (!invitation) {
      throw new AppError(ERROR_CODES.invitationTokenInvalid, "Invitation token is invalid.", 401);
    }

    const survey = await this.requireAccessibleSurvey(invitation.surveyId, "invite_only");
    this.assertInvitationUsable(invitation);
    const surveyDefinition = await this.buildPublicSurvey(survey.publicSlug, invitation.surveyVersionId);

    const rawSessionToken = createSecureToken();
    const expiresAt = new Date(Date.now() + env.respondentSessionTtlMinutes * 60 * 1000).toISOString();

    await this.respondentRepository.createSession({
      expiresAt,
      invitationId: invitation.id,
      sessionTokenHash: hashToken(rawSessionToken),
      surveyId: survey.id,
      surveyVersionId: invitation.surveyVersionId
    });
    await this.invitationRepository.markInvitationOpened(invitation.id);

    return {
      rawSessionToken
      ,
      survey: surveyDefinition
    };
  }

  public async grantAccessByPublicSlug(publicSlug: string): Promise<{
    rawSessionToken: string;
    survey: PublicSurvey;
  }> {
    if (!env.respondentSessionTtlMinutes) {
      throw new AppError(
        ERROR_CODES.internalServerError,
        "Respondent sessions are not configured.",
        503
      );
    }

    const survey = await this.surveyRepository.findSurveyByPublicSlug(publicSlug);

    if (!survey) {
      throw new AppError(ERROR_CODES.surveyNotFound, "Survey was not found.", 404);
    }

    await this.validateSurveyAvailability(survey, "public");

    if (!survey.publishedVersionId) {
      throw new AppError(ERROR_CODES.surveyNotPublished, "Survey is not available.", 404);
    }

    const surveyDefinition = await this.buildPublicSurvey(survey.publicSlug, survey.publishedVersionId);
    const rawSessionToken = createSecureToken();
    const expiresAt = new Date(Date.now() + env.respondentSessionTtlMinutes * 60 * 1000).toISOString();

    await this.respondentRepository.createSession({
      expiresAt,
      invitationId: null,
      sessionTokenHash: hashToken(rawSessionToken),
      surveyId: survey.id,
      surveyVersionId: survey.publishedVersionId
    });

    return {
      rawSessionToken,
      survey: surveyDefinition
    };
  }

  public async logout(sessionId: string): Promise<void> {
    await this.respondentRepository.revokeSession(sessionId);
  }

  public async getSurveyForSession(input: {
    surveyId: string;
    surveyVersionId: string;
  }): Promise<PublicSurvey> {
    const survey = await this.surveyRepository.findSurveyById(input.surveyId);

    if (!survey) {
      throw new AppError(ERROR_CODES.surveyNotFound, "Survey was not found.", 404);
    }

    await this.validateSurveyAvailability(survey);
    return this.buildPublicSurvey(survey.publicSlug, input.surveyVersionId);
  }

  private async buildPublicSurvey(publicSlug: string, surveyVersionId: string): Promise<PublicSurvey> {
    const definition = await this.surveyRepository.getVersionDefinition(surveyVersionId);

    if (!definition) {
      throw new AppError(ERROR_CODES.versionNotFound, "Survey version was not found.", 404);
    }

    return {
      description: definition.version.description,
      options: definition.options.map((option) => ({
        id: option.id,
        label: option.label,
        position: option.position,
        questionId: option.questionId,
        settings: option.settings,
        stableKey: option.stableKey,
        value: option.value
      })),
      questions: definition.questions.map((question) => ({
        description: question.description,
        displayLogic: question.displayLogic,
        id: question.id,
        position: question.position,
        required: question.required,
        sectionId: question.sectionId,
        settings: question.settings,
        stableKey: question.stableKey,
        title: question.title,
        type: question.type,
        validation: question.validation as Record<string, unknown>
      })),
      sections: definition.sections.map((section) => ({
        description: section.description,
        id: section.id,
        position: section.position,
        stableKey: section.stableKey,
        title: section.title
      })),
      settings: definition.version.settings,
      publicSlug,
      title: definition.version.title
    };
  }

  private assertInvitationUsable(invitation: SurveyInvitation) {
    if (invitation.revokedAt) {
      throw new AppError(ERROR_CODES.invitationRevoked, "Invitation was revoked.", 403);
    }

    if (invitation.expiresAt && new Date(invitation.expiresAt).getTime() <= Date.now()) {
      throw new AppError(ERROR_CODES.invitationExpired, "Invitation expired.", 403);
    }

    if (invitation.completedAt || invitation.status === "completed") {
      throw new AppError(ERROR_CODES.invitationAlreadyCompleted, "Invitation was already used.", 403);
    }

    if (invitation.responseCount >= invitation.maxResponses) {
      throw new AppError(ERROR_CODES.invitationLimitReached, "Invitation response limit reached.", 403);
    }
  }

  private async requireAccessibleSurvey(surveyId: string, expectedAccessMode?: "public" | "invite_only") {
    const survey = await this.surveyRepository.findSurveyById(surveyId);

    if (!survey) {
      throw new AppError(ERROR_CODES.surveyNotFound, "Survey was not found.", 404);
    }

    await this.validateSurveyAvailability(survey, expectedAccessMode);
    return survey;
  }

  private async validateSurveyAvailability(
    survey: Survey,
    expectedAccessMode?: "public" | "invite_only"
  ) {
    if (survey.deletedAt || survey.status === "archived") {
      throw new AppError(ERROR_CODES.surveyNotFound, "Survey was not found.", 404);
    }

    if (!survey.publishedVersionId) {
      throw new AppError(ERROR_CODES.surveyNotPublished, "Survey is not available.", 404);
    }

    if (expectedAccessMode && survey.accessMode !== expectedAccessMode) {
      throw new AppError(ERROR_CODES.respondentAccessDenied, "Survey access is not allowed from this link.", 403);
    }

    if (survey.status !== "published") {
      throw new AppError(ERROR_CODES.surveyNotAcceptingResponses, "Survey is not currently accepting responses.", 403);
    }

    if (survey.opensAt && new Date(survey.opensAt).getTime() > Date.now()) {
      throw new AppError(ERROR_CODES.surveyNotOpenYet, "Survey is not open yet.", 403);
    }

    if (survey.closesAt && new Date(survey.closesAt).getTime() <= Date.now()) {
      throw new AppError(ERROR_CODES.surveyClosed, "Survey is closed.", 403);
    }

    const organization = await this.organizationRepository.findById(survey.organizationId);

    if (!organization) {
      throw new AppError(ERROR_CODES.respondentAccessDenied, "Survey organization is not available.", 403);
    }
  }
}
