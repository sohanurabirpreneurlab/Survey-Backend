import type { PaginatedResult } from "../../common/utils/pagination";
import type { SurveyAccessMode, SurveyStatus, SurveyVersionDefinition } from "../surveys/survey.types";

export type SurveyTrackingSummary = {
  accessMode: SurveyAccessMode;
  createdAt: string;
  id: string;
  inProgressResponseCount: number;
  invitationCompletedCount: number;
  invitationCount: number;
  invitationOpenedCount: number;
  invitationSentCount: number;
  isPrivate: boolean;
  organizationId: string;
  organizationName: string;
  status: SurveyStatus;
  submittedResponseCount: number;
  title: string | null;
  updatedAt: string;
};

export type SurveyTrackingSummaryList = PaginatedResult<SurveyTrackingSummary>;

export type SurveyTrackingInvitationRecipient = {
  completedAt: string | null;
  createdAt: string;
  email: string | null;
  expiresAt: string | null;
  firstOpenedAt: string | null;
  id: string;
  lastOpenedAt: string | null;
  responseCount: number;
  startedAt: string | null;
  status: string;
  surveyId: string;
  updatedAt: string;
};

export type SurveyTrackingResponseItem = {
  accessSource: "invitation" | "public";
  invitationId: string | null;
  lastSavedAt: string;
  respondentEmail: string | null;
  responseId: string;
  responseStatus: "in_progress" | "submitted" | "invalidated" | "deleted";
  sessionCreatedAt: string;
  sessionId: string;
  sessionStatus: "active" | "submitted" | "revoked" | "expired";
  submittedAt: string | null;
  surveyId: string;
  surveyVersionId: string;
};

export type SurveyTrackingResponseAnswer = {
  optionIds: string[];
  questionId: string;
  questionStableKey: string;
  valueBoolean: boolean | null;
  valueDate: string | null;
  valueJson: unknown;
  valueNumber: number | null;
  valueText: string | null;
  valueTimestamp: string | null;
};

export type SurveyTrackingAllResponsesColumn = {
  questionStableKey: string;
  title: string;
};

export type SurveyTrackingAllResponsesItem = SurveyTrackingResponseItem & {
  answers: Array<SurveyTrackingResponseAnswer & { displayValue: string }>;
};

export type SurveyTrackingResponsesList = {
  columns: SurveyTrackingAllResponsesColumn[];
  items: SurveyTrackingAllResponsesItem[];
};

export type SurveyTrackingResponsePreview = {
  answers: SurveyTrackingResponseAnswer[];
  definition: SurveyVersionDefinition;
  response: SurveyTrackingResponseItem;
  survey: {
    accessMode: SurveyAccessMode;
    id: string;
    organizationId: string;
    status: SurveyStatus;
    title: string | null;
  };
};
