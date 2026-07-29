import type { Request, Response } from "express";

import { sendCreated, sendSuccess } from "../../common/http/api-response";
import { defaultSurveyVersionSettings } from "./survey.defaults";
import { SurveyService } from "./survey.service";

const surveyService = new SurveyService();
const getParam = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value ?? "");

const parsePaginationNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const createSurvey = async (request: Request, response: Response): Promise<void> => {
  const result = await surveyService.createSurvey({
    accessMode: request.body.accessMode,
    closesAt: request.body.closesAt ?? null,
    createdBy: request.admin!.userId,
    description: request.body.description ?? null,
    opensAt: request.body.opensAt ?? null,
    organizationId: request.body.organizationId,
    responseLimit: request.body.responseLimit ?? null,
    settings: {
      ...defaultSurveyVersionSettings(),
      ...(request.body.settings ?? {})
    },
    slug: request.body.slug,
    title: request.body.title
  });

  sendCreated(response, "Survey created successfully.", result);
};

export const listSurveys = async (request: Request, response: Response): Promise<void> => {
  const data = await surveyService.listSurveys(
    request.admin!.userId,
    typeof request.query.organizationId === "string" ? request.query.organizationId : undefined,
    parsePaginationNumber(request.query.page, 1),
    parsePaginationNumber(request.query.limit, 20)
  );

  response.status(200).json({
    success: true,
    message: "Surveys retrieved successfully.",
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

export const getSurvey = async (request: Request, response: Response): Promise<void> => {
  const survey = await surveyService.getSurvey(getParam(request.params.surveyId), request.admin!.userId);
  sendSuccess(response, "Survey retrieved successfully.", survey);
};

export const getSurveyShare = async (request: Request, response: Response): Promise<void> => {
  const shareInfo = await surveyService.getSurveyShareInfo(
    getParam(request.params.surveyId),
    request.admin!.userId
  );
  sendSuccess(response, "Survey sharing information retrieved successfully.", shareInfo);
};

export const updateSurvey = async (request: Request, response: Response): Promise<void> => {
  const survey = await surveyService.updateSurveyMetadata(
    {
      accessMode: request.body.accessMode,
      closesAt: request.body.closesAt ?? null,
      opensAt: request.body.opensAt ?? null,
      responseLimit: request.body.responseLimit ?? null,
      slug: request.body.slug,
      surveyId: getParam(request.params.surveyId)
    },
    request.admin!.userId
  );

  sendSuccess(response, "Survey updated successfully.", survey);
};

export const createDraft = async (request: Request, response: Response): Promise<void> => {
  const draft = await surveyService.createDraftFromPublishedVersion(
    getParam(request.params.surveyId),
    request.admin!.userId,
    request.body.changeSummary ?? null
  );
  sendCreated(response, "Draft prepared successfully.", draft);
};

export const updateDraft = async (request: Request, response: Response): Promise<void> => {
  const draft = await surveyService.updateDraftVersion(
    {
      changeSummary: request.body.changeSummary ?? null,
      description: request.body.description ?? null,
      settings: {
        ...defaultSurveyVersionSettings(),
        ...(request.body.settings ?? {})
      },
      surveyVersionId: "",
      title: request.body.title
    },
    getParam(request.params.surveyId),
    request.admin!.userId
  );

  sendSuccess(response, "Draft updated successfully.", draft);
};

export const discardDraft = async (request: Request, response: Response): Promise<void> => {
  await surveyService.discardDraft(getParam(request.params.surveyId), request.admin!.userId);
  sendSuccess(response, "Draft discarded successfully.", null);
};

export const publishDraft = async (request: Request, response: Response): Promise<void> => {
  const version = await surveyService.publishDraft(getParam(request.params.surveyId), request.admin!.userId);
  sendSuccess(response, "Survey published successfully.", version);
};

export const closeSurvey = async (request: Request, response: Response): Promise<void> => {
  const survey = await surveyService.closeSurvey(getParam(request.params.surveyId), request.admin!.userId);
  sendSuccess(response, "Survey closed successfully.", survey);
};

export const reopenSurvey = async (request: Request, response: Response): Promise<void> => {
  const survey = await surveyService.reopenSurvey(getParam(request.params.surveyId), request.admin!.userId);
  sendSuccess(response, "Survey reopened successfully.", survey);
};

export const listVersions = async (request: Request, response: Response): Promise<void> => {
  const versions = await surveyService.listVersions(getParam(request.params.surveyId), request.admin!.userId);
  sendSuccess(response, "Survey versions retrieved successfully.", versions);
};

export const getVersion = async (request: Request, response: Response): Promise<void> => {
  const version = await surveyService.getVersion(
    getParam(request.params.surveyId),
    getParam(request.params.versionId),
    request.admin!.userId
  );
  sendSuccess(response, "Survey version retrieved successfully.", version);
};

export const compareVersions = async (request: Request, response: Response): Promise<void> => {
  const comparison = await surveyService.compareVersions(
    getParam(request.params.surveyId),
    String(request.query.fromVersionId),
    String(request.query.toVersionId),
    request.admin!.userId
  );
  sendSuccess(response, "Survey versions compared successfully.", comparison);
};

export const createSection = async (request: Request, response: Response): Promise<void> => {
  const section = await surveyService.createSection(
    {
      description: request.body.description ?? null,
      position: Number(request.body.position),
      surveyVersionId: "",
      title: request.body.title
    },
    getParam(request.params.surveyId),
    request.admin!.userId
  );
  sendCreated(response, "Section created successfully.", section);
};

export const updateSection = async (request: Request, response: Response): Promise<void> => {
  const section = await surveyService.updateSection(
    {
      description: request.body.description ?? null,
      position: Number(request.body.position),
      sectionId: getParam(request.params.sectionId),
      title: request.body.title
    },
    getParam(request.params.surveyId),
    request.admin!.userId
  );
  sendSuccess(response, "Section updated successfully.", section);
};

export const deleteSection = async (request: Request, response: Response): Promise<void> => {
  await surveyService.deleteSection(
    { sectionId: getParam(request.params.sectionId) },
    getParam(request.params.surveyId),
    request.admin!.userId
  );
  sendSuccess(response, "Section deleted successfully.", null);
};

export const reorderSections = async (request: Request, response: Response): Promise<void> => {
  const sections = await surveyService.reorderSections(
    { items: request.body.items, surveyVersionId: "" },
    getParam(request.params.surveyId),
    request.admin!.userId
  );
  sendSuccess(response, "Sections reordered successfully.", sections);
};

export const createQuestion = async (request: Request, response: Response): Promise<void> => {
  const question = await surveyService.createQuestion(
    {
      description: request.body.description ?? null,
      displayLogic: request.body.displayLogic ?? {},
      options: request.body.options ?? [],
      position: Number(request.body.position),
      questionType: request.body.type,
      required: Boolean(request.body.required),
      sectionId: request.body.sectionId,
      settings: request.body.settings ?? {},
      surveyVersionId: "",
      title: request.body.title,
      validation: request.body.validation ?? {}
    },
    getParam(request.params.surveyId),
    request.admin!.userId
  );
  sendCreated(response, "Question created successfully.", question);
};

export const updateQuestion = async (request: Request, response: Response): Promise<void> => {
  const question = await surveyService.updateQuestion(
    {
      confirmRemoveOptions: Boolean(request.body.confirmRemoveOptions),
      description: request.body.description ?? null,
      displayLogic: request.body.displayLogic ?? {},
      position: Number(request.body.position),
      questionId: getParam(request.params.questionId),
      questionType: request.body.type,
      required: Boolean(request.body.required),
      settings: request.body.settings ?? {},
      title: request.body.title,
      validation: request.body.validation ?? {}
    },
    getParam(request.params.surveyId),
    request.admin!.userId
  );
  sendSuccess(response, "Question updated successfully.", question);
};

export const deleteQuestion = async (request: Request, response: Response): Promise<void> => {
  await surveyService.deleteQuestion(
    { questionId: getParam(request.params.questionId) },
    getParam(request.params.surveyId),
    request.admin!.userId
  );
  sendSuccess(response, "Question deleted successfully.", null);
};

export const reorderQuestions = async (request: Request, response: Response): Promise<void> => {
  const questions = await surveyService.reorderQuestions(
    { items: request.body.items, sectionId: request.body.sectionId },
    getParam(request.params.surveyId),
    request.admin!.userId
  );
  sendSuccess(response, "Questions reordered successfully.", questions);
};

export const createOption = async (request: Request, response: Response): Promise<void> => {
  const option = await surveyService.createOption(
    {
      label: request.body.label,
      position: Number(request.body.position),
      questionId: getParam(request.params.questionId),
      settings: request.body.settings ?? {},
      value: request.body.value
    },
    getParam(request.params.surveyId),
    request.admin!.userId
  );
  sendCreated(response, "Option created successfully.", option);
};

export const updateOption = async (request: Request, response: Response): Promise<void> => {
  const option = await surveyService.updateOption(
    {
      label: request.body.label,
      optionId: getParam(request.params.optionId),
      position: Number(request.body.position),
      scoreValue: request.body.scoreValue ?? null,
      settings: request.body.settings ?? {},
      value: request.body.value
    },
    getParam(request.params.surveyId),
    request.admin!.userId
  );
  sendSuccess(response, "Option updated successfully.", option);
};

export const deleteOption = async (request: Request, response: Response): Promise<void> => {
  await surveyService.deleteOption(
    { optionId: getParam(request.params.optionId) },
    getParam(request.params.surveyId),
    request.admin!.userId
  );
  sendSuccess(response, "Option deleted successfully.", null);
};

export const reorderOptions = async (request: Request, response: Response): Promise<void> => {
  const options = await surveyService.reorderOptions(
    {
      items: request.body.items,
      questionId: getParam(request.params.questionId)
    },
    getParam(request.params.surveyId),
    request.admin!.userId
  );
  sendSuccess(response, "Options reordered successfully.", options);
};

export const bulkUpdateOptionScores = async (request: Request, response: Response): Promise<void> => {
  const options = await surveyService.bulkUpdateOptionScores(
    {
      options: request.body.options.map((option: { optionId: string; scoreValue: number | null }) => ({
        optionId: option.optionId,
        scoreValue: option.scoreValue ?? null
      })),
      questionId: getParam(request.params.questionId)
    },
    getParam(request.params.surveyId),
    request.admin!.userId
  );
  sendSuccess(response, "Option scores updated successfully.", options);
};

export const listCalculatedScores = async (request: Request, response: Response): Promise<void> => {
  const scores = await surveyService.listCalculatedScores(getParam(request.params.surveyId), request.admin!.userId);
  sendSuccess(response, "Calculated scores retrieved successfully.", scores);
};

export const createCalculatedScore = async (request: Request, response: Response): Promise<void> => {
  const score = await surveyService.createCalculatedScore(
    {
      calculationType: request.body.calculationType,
      decimalPlaces: Number(request.body.decimalPlaces),
      key: request.body.key,
      name: request.body.name,
      requireAllAnswers: Boolean(request.body.requireAllAnswers),
      sourceQuestionIds: request.body.sourceQuestionIds ?? [],
      surveyVersionId: "",
      targets: request.body.targets ?? [],
      thresholdOperator: request.body.thresholdOperator,
      thresholdValue: Number(request.body.thresholdValue)
    },
    getParam(request.params.surveyId),
    request.admin!.userId
  );
  sendCreated(response, "Calculated score created successfully.", score);
};

export const updateCalculatedScore = async (request: Request, response: Response): Promise<void> => {
  const score = await surveyService.updateCalculatedScore(
    {
      calculatedScoreId: getParam(request.params.calculatedScoreId),
      calculationType: request.body.calculationType,
      decimalPlaces: Number(request.body.decimalPlaces),
      key: request.body.key,
      name: request.body.name,
      requireAllAnswers: Boolean(request.body.requireAllAnswers),
      sourceQuestionIds: request.body.sourceQuestionIds ?? [],
      surveyVersionId: "",
      targets: request.body.targets ?? [],
      thresholdOperator: request.body.thresholdOperator,
      thresholdValue: Number(request.body.thresholdValue)
    },
    getParam(request.params.surveyId),
    request.admin!.userId
  );
  sendSuccess(response, "Calculated score updated successfully.", score);
};

export const deleteCalculatedScore = async (request: Request, response: Response): Promise<void> => {
  await surveyService.deleteCalculatedScore(
    getParam(request.params.calculatedScoreId),
    getParam(request.params.surveyId),
    request.admin!.userId
  );
  sendSuccess(response, "Calculated score deleted successfully.", null);
};
