import type {
  SurveyTrackingResponseAnswer,
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
  listSurveyResponseAnswers(surveyId: string): Promise<Array<SurveyTrackingResponseAnswer & { responseId: string }>>;
  listSurveyResponses(surveyId: string): Promise<SurveyTrackingResponseItem[]>;
  listTrackedSurveys(input: {
    limit: number;
    organizationIds?: string[];
    page: number;
  }): Promise<SurveyTrackingSummaryList>;
}
