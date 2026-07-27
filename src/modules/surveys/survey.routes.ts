import { Router } from "express";

import { asyncHandler } from "../../common/http/async-handler";
import { authenticateUser } from "../../common/middleware/authenticate-user";
import { requireApprovedAccount } from "../../common/middleware/require-approved-account";
import { validateRequest } from "../../common/middleware/validate-request";
import { invitationRouter } from "../invitations/invitation.routes";
import { resultRouter } from "../results/result.routes";
import {
  closeSurvey,
  compareVersions,
  createDraft,
  createOption,
  createQuestion,
  createSection,
  createSurvey,
  updateDraft,
  deleteOption,
  deleteQuestion,
  deleteSection,
  discardDraft,
  getSurvey,
  getSurveyShare,
  getVersion,
  listSurveys,
  listVersions,
  publishDraft,
  reorderOptions,
  reorderQuestions,
  reorderSections,
  reopenSurvey,
  updateOption,
  updateQuestion,
  updateSection,
  updateSurvey
} from "./survey.controller";
import {
  closeSurveyValidators,
  compareVersionsValidators,
  createDraftValidators,
  createOptionValidators,
  createQuestionValidators,
  createSectionValidators,
  createSurveyValidators,
  deleteOptionValidators,
  deleteQuestionValidators,
  deleteSectionValidators,
  listSurveysValidators,
  optionIdParamValidator,
  publishDraftValidators,
  questionIdParamValidator,
  reorderOptionsValidators,
  reorderQuestionsValidators,
  reorderSectionsValidators,
  reopenSurveyValidators,
  sectionIdParamValidator,
  surveyIdParamValidator,
  updateOptionValidators,
  updateDraftValidators,
  updateQuestionValidators,
  updateSectionValidators,
  updateSurveyValidators,
  versionIdParamValidator
} from "./survey.validators";

const surveyRouter = Router();

surveyRouter.use(authenticateUser);
surveyRouter.use(requireApprovedAccount);
surveyRouter.use("/:surveyId/invitations", invitationRouter);
surveyRouter.use("/:surveyId/results", resultRouter);

surveyRouter.post("/", createSurveyValidators, validateRequest, asyncHandler(createSurvey));
surveyRouter.get("/", listSurveysValidators, validateRequest, asyncHandler(listSurveys));
surveyRouter.get("/:surveyId", surveyIdParamValidator, validateRequest, asyncHandler(getSurvey));
surveyRouter.get("/:surveyId/share", surveyIdParamValidator, validateRequest, asyncHandler(getSurveyShare));
surveyRouter.patch("/:surveyId", updateSurveyValidators, validateRequest, asyncHandler(updateSurvey));

surveyRouter.post("/:surveyId/draft", createDraftValidators, validateRequest, asyncHandler(createDraft));
surveyRouter.patch("/:surveyId/draft", updateDraftValidators, validateRequest, asyncHandler(updateDraft));
surveyRouter.delete("/:surveyId/draft", surveyIdParamValidator, validateRequest, asyncHandler(discardDraft));

surveyRouter.post("/:surveyId/publish", publishDraftValidators, validateRequest, asyncHandler(publishDraft));
surveyRouter.post("/:surveyId/close", closeSurveyValidators, validateRequest, asyncHandler(closeSurvey));
surveyRouter.post("/:surveyId/reopen", reopenSurveyValidators, validateRequest, asyncHandler(reopenSurvey));

surveyRouter.get("/:surveyId/versions", surveyIdParamValidator, validateRequest, asyncHandler(listVersions));
surveyRouter.get(
  "/:surveyId/versions/:versionId",
  [...surveyIdParamValidator, ...versionIdParamValidator],
  validateRequest,
  asyncHandler(getVersion)
);
surveyRouter.get(
  "/:surveyId/versions/compare",
  compareVersionsValidators,
  validateRequest,
  asyncHandler(compareVersions)
);

surveyRouter.post(
  "/:surveyId/draft/sections",
  createSectionValidators,
  validateRequest,
  asyncHandler(createSection)
);
surveyRouter.patch(
  "/:surveyId/draft/sections/:sectionId",
  updateSectionValidators,
  validateRequest,
  asyncHandler(updateSection)
);
surveyRouter.delete(
  "/:surveyId/draft/sections/:sectionId",
  deleteSectionValidators,
  validateRequest,
  asyncHandler(deleteSection)
);
surveyRouter.patch(
  "/:surveyId/draft/sections/reorder",
  reorderSectionsValidators,
  validateRequest,
  asyncHandler(reorderSections)
);

surveyRouter.post(
  "/:surveyId/draft/questions",
  createQuestionValidators,
  validateRequest,
  asyncHandler(createQuestion)
);
surveyRouter.patch(
  "/:surveyId/draft/questions/:questionId",
  updateQuestionValidators,
  validateRequest,
  asyncHandler(updateQuestion)
);
surveyRouter.delete(
  "/:surveyId/draft/questions/:questionId",
  deleteQuestionValidators,
  validateRequest,
  asyncHandler(deleteQuestion)
);
surveyRouter.patch(
  "/:surveyId/draft/questions/reorder",
  reorderQuestionsValidators,
  validateRequest,
  asyncHandler(reorderQuestions)
);

surveyRouter.post(
  "/:surveyId/draft/questions/:questionId/options",
  createOptionValidators,
  validateRequest,
  asyncHandler(createOption)
);
surveyRouter.patch(
  "/:surveyId/draft/questions/:questionId/options/:optionId",
  updateOptionValidators,
  validateRequest,
  asyncHandler(updateOption)
);
surveyRouter.delete(
  "/:surveyId/draft/questions/:questionId/options/:optionId",
  deleteOptionValidators,
  validateRequest,
  asyncHandler(deleteOption)
);
surveyRouter.patch(
  "/:surveyId/draft/questions/:questionId/options/reorder",
  reorderOptionsValidators,
  validateRequest,
  asyncHandler(reorderOptions)
);

export { surveyRouter };
