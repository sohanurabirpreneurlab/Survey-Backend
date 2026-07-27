import { body, param } from "express-validator";

export const invitationRouteParams = [
  param("surveyId").isUUID().withMessage("surveyId must be a valid UUID.")
];

export const invitationIdRouteParams = [
  ...invitationRouteParams,
  param("invitationId").isUUID().withMessage("invitationId must be a valid UUID.")
];

export const createInvitationValidators = [
  ...invitationRouteParams,
  body("recipients").isArray({ min: 1 }).withMessage("recipients must contain at least one recipient."),
  body("recipients.*.email").isEmail().withMessage("Each recipient email must be valid."),
  body("maxResponses").optional().isInt({ min: 1 }).withMessage("maxResponses must be at least 1."),
  body("expiresAt").optional({ nullable: true }).isISO8601().withMessage("expiresAt must be a valid timestamp.")
];
