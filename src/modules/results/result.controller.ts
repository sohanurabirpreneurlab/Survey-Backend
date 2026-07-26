import type { Request, Response } from "express";

import { sendSuccess } from "../../common/http/api-response";
import { ResultService } from "./result.service";

const resultService = new ResultService();
const getParam = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value ?? "");

export const getSurveyResults = async (request: Request, response: Response): Promise<void> => {
  const data = await resultService.getSurveySummary(getParam(request.params.surveyId), request.admin!.userId);
  sendSuccess(response, "Survey results retrieved successfully.", data);
};

export const getQuestionResults = async (request: Request, response: Response): Promise<void> => {
  const data = await resultService.getChoiceQuestionResults(
    getParam(request.params.surveyId),
    getParam(request.params.questionId),
    request.admin!.userId
  );
  sendSuccess(response, "Question results retrieved successfully.", data);
};
