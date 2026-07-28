import type { Request, Response } from "express";

import { sendSuccess } from "../../common/http/api-response";
import { SurveyTrackingService } from "./survey-tracking.service";

const surveyTrackingService = new SurveyTrackingService();
const getParam = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value ?? "");

const parsePaginationNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const listTrackedSurveys = async (request: Request, response: Response): Promise<void> => {
  const data = await surveyTrackingService.listTrackedSurveys(
    request.admin!.userId,
    parsePaginationNumber(request.query.page, 1),
    parsePaginationNumber(request.query.limit, 20)
  );

  response.status(200).json({
    success: true,
    message: "Tracked surveys retrieved successfully.",
    data: data.items,
    meta: {
      pagination: {
        limit: data.limit,
        page: data.page,
        total: data.total,
        totalPages: data.totalPages
      },
      requestId: request.requestId ?? null
    }
  });
};

export const listTrackingRecipients = async (request: Request, response: Response): Promise<void> => {
  const data = await surveyTrackingService.listInvitationRecipients(
    getParam(request.params.surveyId),
    request.admin!.userId
  );
  sendSuccess(response, "Survey invitation recipients retrieved successfully.", data);
};

export const listTrackingResponses = async (request: Request, response: Response): Promise<void> => {
  const data = await surveyTrackingService.listSurveyResponses(
    getParam(request.params.surveyId),
    request.admin!.userId
  );
  sendSuccess(response, "Survey tracked responses retrieved successfully.", data);
};

export const getTrackingResponsePreview = async (request: Request, response: Response): Promise<void> => {
  const data = await surveyTrackingService.getResponsePreview(
    getParam(request.params.surveyId),
    getParam(request.params.responseId),
    request.admin!.userId
  );
  sendSuccess(response, "Survey response preview retrieved successfully.", data);
};
