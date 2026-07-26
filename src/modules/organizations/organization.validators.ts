import { body, param } from "express-validator";

export const createOrganizationValidators = [
  body("name").isString().trim().notEmpty().withMessage("name is required."),
  body("slug")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("slug is required.")
    .matches(/^[a-z0-9-]+$/)
    .withMessage("slug may contain lowercase letters, numbers, and hyphens only.")
];

export const organizationIdParamValidators = [
  param("organizationId").isUUID().withMessage("organizationId must be a valid UUID.")
];
