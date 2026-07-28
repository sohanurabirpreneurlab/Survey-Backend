import type {
  SurveyTrackingInvitationRecipient,
  SurveyTrackingResponseItem,
  SurveyTrackingResponsePreview,
  SurveyTrackingSummaryList
} from "./survey-tracking.types";

export interface ISurveyTrackingRepository {
  getResponsePreview(
    surveyId: string,
    responseId: string
  ): Promise<
    | {
        answers: SurveyTrackingResponsePreview["answers"];
        response: SurveyTrackingResponseItem;
        survey: SurveyTrackingResponsePreview["survey"];
      }
    | null
  >;
  listInvitationRecipients(surveyId: string): Promise<SurveyTrackingInvitationRecipient[]>;
  listSurveyResponses(surveyId: string): Promise<SurveyTrackingResponseItem[]>;
  listTrackedSurveys(input: {
    limit: number;
    organizationIds?: string[];
    page: number;
  }): Promise<SurveyTrackingSummaryList>;
}
