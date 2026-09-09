import { body } from "express-validator";

export const sendSurveyInvitationEmailValidators = [
  body("surveyId").isUUID().withMessage("surveyId must be a valid UUID."),
  body("email").isString().bail().trim().isEmail().withMessage("email must be a valid email address.")
];

export const getSurveyCompletionStatusValidators = [
  body("surveyId").isUUID().withMessage("surveyId must be a valid UUID."),
  body("emails").isArray({ min: 1, max: 500 }).withMessage("emails must contain between 1 and 500 email addresses."),
  body("emails.*").isString().bail().trim().isEmail().withMessage("Each email must be a valid email address.")
];

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
