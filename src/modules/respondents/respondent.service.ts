import { AppError } from "../../common/errors/app-error";
import { ERROR_CODES } from "../../common/errors/error-codes";
import { clearRespondentSessionCookie, setRespondentSessionCookie } from "../../common/security/respondent-cookie";
import { createSecureToken, hashToken } from "../../common/security/token-hash";
import { env } from "../../config/env";
import { InvitationRepository } from "../invitations/invitation.repository";
import type { IInvitationRepository } from "../invitations/invitation.repository.interface";
import { SurveyRepository } from "../surveys/survey.repository";
import type { ISurveyRepository } from "../surveys/survey.repository.interface";
import { RespondentRepository } from "./respondent.repository";
import type { IRespondentRepository } from "./respondent.repository.interface";
import type { PublicSurvey } from "./respondent.types";

export class RespondentService {
  public constructor(
    private readonly invitationRepository: IInvitationRepository = new InvitationRepository(),
    private readonly respondentRepository: IRespondentRepository = new RespondentRepository(),
    private readonly surveyRepository: ISurveyRepository = new SurveyRepository()
  ) {}

  public async grantAccessByInvitationToken(rawToken: string): Promise<{
    publicSurveyPath: string;
    rawSessionToken: string;
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

    if (invitation.revokedAt) {
      throw new AppError(ERROR_CODES.invitationRevoked, "Invitation was revoked.", 403);
    }

    if (invitation.expiresAt && new Date(invitation.expiresAt).getTime() <= Date.now()) {
      throw new AppError(ERROR_CODES.invitationExpired, "Invitation expired.", 403);
    }

    if (invitation.responseCount >= invitation.maxResponses) {
      throw new AppError(ERROR_CODES.invitationLimitReached, "Invitation response limit reached.", 403);
    }

    const survey = await this.surveyRepository.findSurveyById(invitation.surveyId);

    if (!survey || !survey.publishedVersionId) {
      throw new AppError(ERROR_CODES.surveyNotPublished, "Survey is not available.", 403);
    }

    if (survey.status !== "published") {
      throw new AppError(
        ERROR_CODES.surveyNotAcceptingResponses,
        "Survey is not currently accepting responses.",
        403
      );
    }

    if (survey.opensAt && new Date(survey.opensAt).getTime() > Date.now()) {
      throw new AppError(ERROR_CODES.surveyNotOpenYet, "Survey is not open yet.", 403);
    }

    if (survey.closesAt && new Date(survey.closesAt).getTime() <= Date.now()) {
      throw new AppError(ERROR_CODES.surveyClosed, "Survey is closed.", 403);
    }

    const rawSessionToken = createSecureToken();
    const expiresAt = new Date(Date.now() + env.respondentSessionTtlMinutes * 60 * 1000).toISOString();

    await this.respondentRepository.createSession({
      expiresAt,
      invitationId: invitation.id,
      sessionTokenHash: hashToken(rawSessionToken),
      surveyId: survey.id
    });
    await this.invitationRepository.markInvitationOpened(invitation.id);

    return {
      publicSurveyPath: `/s/${survey.slug}`,
      rawSessionToken
    };
  }

  public async logout(sessionId: string): Promise<void> {
    await this.respondentRepository.revokeSession(sessionId);
  }

  public async getPublicSurvey(surveyId: string): Promise<PublicSurvey> {
    const survey = await this.surveyRepository.findSurveyById(surveyId);

    if (!survey || !survey.publishedVersionId) {
      throw new AppError(ERROR_CODES.surveyNotPublished, "Survey is not available.", 404);
    }

    const definition = await this.surveyRepository.getVersionDefinition(survey.publishedVersionId);

    if (!definition) {
      throw new AppError(ERROR_CODES.versionNotFound, "Published survey version was not found.", 404);
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
      slug: survey.slug,
      surveyId: survey.id,
      surveyVersionId: definition.version.id,
      title: definition.version.title
    };
  }
}
