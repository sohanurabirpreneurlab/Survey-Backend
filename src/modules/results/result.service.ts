import { AppError } from "../../common/errors/app-error";
import { ERROR_CODES } from "../../common/errors/error-codes";
import { AuthRepository } from "../auth/auth.repository";
import { OrganizationService } from "../organizations/organization.service";
import { SurveyRepository } from "../surveys/survey.repository";
import { ResultRepository } from "./result.repository";
import type { IResultRepository } from "./result.repository.interface";

export class ResultService {
  public constructor(
    private readonly resultRepository: IResultRepository = new ResultRepository(),
    private readonly surveyRepository = new SurveyRepository(),
    private readonly organizationService = new OrganizationService(),
    private readonly authRepository = new AuthRepository()
  ) {}

  public async getSurveySummary(surveyId: string, userId: string) {
    const survey = await this.surveyRepository.findSurveyById(surveyId);

    if (!survey) {
      throw new AppError(ERROR_CODES.surveyNotFound, "Survey was not found.", 404);
    }

    await this.assertCanViewResults(survey.organizationId, userId);
    return this.resultRepository.getSurveyResponseSummary(surveyId);
  }

  public async getChoiceQuestionResults(surveyId: string, questionId: string, userId: string) {
    const survey = await this.surveyRepository.findSurveyById(surveyId);

    if (!survey) {
      throw new AppError(ERROR_CODES.surveyNotFound, "Survey was not found.", 404);
    }

    await this.assertCanViewResults(survey.organizationId, userId);
    return this.resultRepository.getChoiceQuestionResults(questionId);
  }

  private async assertCanViewResults(organizationId: string, userId: string): Promise<void> {
    const account = await this.authRepository.findUserByUserId(userId);

    if (!account) {
      throw new AppError(ERROR_CODES.userProfileNotFound, "Account profile is missing.", 403);
    }

    if (account.profile.role === "admin") {
      return;
    }

    const membership = await this.organizationService.requireOrganizationMembership(organizationId, userId);
    this.organizationService.requireSurveyReadPermission(membership);
  }
}
