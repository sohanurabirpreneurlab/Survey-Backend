import { AppError } from "../../common/errors/app-error";
import { ERROR_CODES } from "../../common/errors/error-codes";
import { OrganizationService } from "../organizations/organization.service";
import { SurveyRepository } from "../surveys/survey.repository";
import { ResultRepository } from "./result.repository";
import type { IResultRepository } from "./result.repository.interface";

export class ResultService {
  public constructor(
    private readonly resultRepository: IResultRepository = new ResultRepository(),
    private readonly surveyRepository = new SurveyRepository(),
    private readonly organizationService = new OrganizationService()
  ) {}

  public async getSurveySummary(surveyId: string, userId: string) {
    const survey = await this.surveyRepository.findSurveyById(surveyId);

    if (!survey) {
      throw new AppError(ERROR_CODES.surveyNotFound, "Survey was not found.", 404);
    }

    const membership = await this.organizationService.requireOrganizationMembership(
      survey.organizationId,
      userId
    );
    this.organizationService.requireSurveyReadPermission(membership);
    return this.resultRepository.getSurveyResponseSummary(surveyId);
  }

  public async getChoiceQuestionResults(surveyId: string, questionId: string, userId: string) {
    const survey = await this.surveyRepository.findSurveyById(surveyId);

    if (!survey) {
      throw new AppError(ERROR_CODES.surveyNotFound, "Survey was not found.", 404);
    }

    const membership = await this.organizationService.requireOrganizationMembership(
      survey.organizationId,
      userId
    );
    this.organizationService.requireSurveyReadPermission(membership);
    return this.resultRepository.getChoiceQuestionResults(questionId);
  }
}
