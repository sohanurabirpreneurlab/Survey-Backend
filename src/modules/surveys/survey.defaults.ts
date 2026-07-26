import type { SurveyVersionSettings } from "./survey.types";

export const defaultSurveyVersionSettings = (): SurveyVersionSettings => ({
  allowBackNavigation: true,
  confirmationMessage: "Your response has been submitted.",
  oneQuestionPerPage: false,
  redirectUrl: null,
  showConfirmationPage: true,
  showProgressBar: true,
  showQuestionNumbers: true,
  shuffleOptions: false,
  shuffleQuestions: false,
  theme: {
    logoUrl: null,
    primaryColor: null
  }
});
