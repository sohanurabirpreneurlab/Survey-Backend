export interface IResultRepository {
  getSurveyResponseSummary(surveyId: string): Promise<{
    inProgressCount: number;
    submittedCount: number;
    surveyId: string;
  }>;
  getChoiceQuestionResults(questionId: string): Promise<{
    options: Array<{ label: string; optionId: string; percentage: number; voteCount: number }>;
    questionId: string;
    totalVotes: number;
  }>;
}
