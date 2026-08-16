import { body } from "express-validator";

export const resolveExternalSurveyInvitationValidators = [
  body("email").isEmail().withMessage("email must be a valid email address."),
  body("surveyId").isUUID().withMessage("surveyId must be a valid UUID.")
];
