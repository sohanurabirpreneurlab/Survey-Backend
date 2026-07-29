import { AppError } from "../../common/errors/app-error";
import { ERROR_CODES } from "../../common/errors/error-codes";
import { AuthRepository } from "../auth/auth.repository";
import { decryptEmail } from "../../common/security/email-protection";
import { OrganizationService } from "../organizations/organization.service";
import { SurveyRepository } from "../surveys/survey.repository";
import type { ISurveyRepository } from "../surveys/survey.repository.interface";
import type { QuestionOption, SurveyVersionDefinition } from "../surveys/survey.types";
import { SurveyTrackingRepository } from "./survey-tracking.repository";
import type { ISurveyTrackingRepository } from "./survey-tracking.repository.interface";
import type { SurveyTrackingResponseAnswer } from "./survey-tracking.types";

const fallbackAnswerValue = (answer: SurveyTrackingResponseAnswer): string => {
  if (answer.valueText) {
    return answer.valueText;
  }

  if (answer.valueNumber !== null) {
    return String(answer.valueNumber);
  }

  if (answer.valueBoolean !== null) {
    return answer.valueBoolean ? "Yes" : "No";
  }

  if (answer.valueTimestamp) {
    return answer.valueTimestamp;
  }

  if (answer.valueDate) {
    return answer.valueDate;
  }

  if (answer.valueJson !== null && answer.valueJson !== undefined) {
    return JSON.stringify(answer.valueJson);
  }

  return "No answer";
};

const formatAnswerValue = (
  questionType: string | undefined,
  answer: SurveyTrackingResponseAnswer,
  options: QuestionOption[]
): string => {
  if (!questionType) {
    return fallbackAnswerValue(answer);
  }

  if (questionType === "single_choice" || questionType === "vote") {
    return options.find((option) => option.id === answer.valueText)?.label ?? answer.valueText ?? "No answer";
  }

  if (questionType === "multiple_choice") {
    return answer.optionIds.length > 0
      ? answer.optionIds.map((optionId) => options.find((option) => option.id === optionId)?.label ?? optionId).join(", ")
      : "No answer";
  }

  if (questionType === "yes_no") {
    return answer.valueBoolean === null ? "No answer" : answer.valueBoolean ? "Yes" : "No";
  }

  if (questionType === "rating") {
    return answer.valueNumber === null ? "No answer" : String(answer.valueNumber);
  }

  if (questionType === "short_text" || questionType === "long_text") {
    return answer.valueText ?? "No answer";
  }

  return fallbackAnswerValue(answer);
};

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
    const answers = await this.trackingRepository.listSurveyResponseAnswers(surveyId);
    const versionIds = [...new Set(responses.map((response) => response.surveyVersionId))];
    const definitions = new Map<string, SurveyVersionDefinition>();
    const responseVersionMap = new Map(responses.map((response) => [response.responseId, response.surveyVersionId]));

    for (const versionId of versionIds) {
      definitions.set(versionId, await this.getDefinition(versionId));
    }

    const primaryVersionId = responses[0]?.surveyVersionId ?? versionIds[0] ?? null;
    const primaryDefinition = primaryVersionId ? definitions.get(primaryVersionId) ?? null : null;
    const primaryQuestions = primaryDefinition
      ? [...primaryDefinition.sections]
          .sort((left, right) => left.position - right.position)
          .flatMap((section) =>
            primaryDefinition.questions
              .filter((question) => question.sectionId === section.id)
              .sort((left, right) => left.position - right.position)
          )
      : [];
    const columnMap = new Map(primaryQuestions.map((question) => [question.stableKey, { questionStableKey: question.stableKey, title: question.title }]));

    definitions.forEach((definition) => {
      definition.questions.forEach((question) => {
        if (!columnMap.has(question.stableKey)) {
          columnMap.set(question.stableKey, {
            questionStableKey: question.stableKey,
            title: question.title
          });
        }
      });
    });

    const answersByResponseId = new Map<string, Array<SurveyTrackingResponseAnswer & { displayValue: string }>>();

    answers.forEach((answer) => {
      const definition = definitions.get(responseVersionMap.get(answer.responseId) ?? "");
      const question = definition?.questions.find((item) => item.id === answer.questionId || item.stableKey === answer.questionStableKey);
      const options = definition?.options.filter((option) => option.questionId === answer.questionId) ?? [];
      const responseAnswers = answersByResponseId.get(answer.responseId) ?? [];

      responseAnswers.push({
        ...answer,
        displayValue: formatAnswerValue(question?.type, answer, options)
      });
      answersByResponseId.set(answer.responseId, responseAnswers);
    });

    return {
      columns: [...columnMap.values()],
      items: responses.map((response) => ({
        ...response,
        answers: answersByResponseId.get(response.responseId) ?? [],
        respondentEmail: response.respondentEmail ? decryptEmail(response.respondentEmail) : null
      }))
    };
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
