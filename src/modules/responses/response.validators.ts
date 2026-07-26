import { body, param } from "express-validator";

export const responseIdParamValidators = [
  param("responseId").isUUID().withMessage("responseId must be a valid UUID.")
];

export const saveAnswerValidators = [
  ...responseIdParamValidators,
  param("questionId").isUUID().withMessage("questionId must be a valid UUID."),
  body("expectedRevision").isInt({ min: 1 }).withMessage("expectedRevision must be a positive integer.")
];

export const submitResponseValidators = [...responseIdParamValidators];
