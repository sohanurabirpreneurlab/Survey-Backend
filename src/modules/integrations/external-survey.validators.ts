import { body } from "express-validator";

export const resolveExternalSurveyInvitationValidators = [
  body("email").isEmail().withMessage("email must be a valid email address."),
  body("surveyIds")
    .isArray({ min: 1 })
    .withMessage("surveyIds must be a non-empty array."),
  body("surveyIds.*").isUUID().withMessage("Each surveyId must be a valid UUID.")
];

export const getExternalSurveyInfoValidators = [
  body("surveyId").isUUID().withMessage("surveyId must be a valid UUID.")
];
