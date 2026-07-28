import { body, param, query } from "express-validator";

export const userIdParamValidator = [param("userId").isUUID().withMessage("userId must be a valid UUID.")];
export const organizationIdParamValidator = [
  param("organizationId").isUUID().withMessage("organizationId must be a valid UUID.")
];

export const listUsersValidators = [
  query("status")
    .optional()
    .isIn(["pending", "approved", "rejected", "suspended"])
    .withMessage("status is invalid."),
  query("q").optional().isString().withMessage("q must be a string."),
  query("page").optional().isInt({ min: 1 }).withMessage("page must be 1 or greater."),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("limit must be between 1 and 100.")
];

export const approveUserValidators = [
  ...userIdParamValidator,
  body("organizationName")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("organizationName is required.")
    .isLength({ min: 2, max: 120 })
    .withMessage("organizationName must be between 2 and 120 characters.")
];

export const rejectUserValidators = [
  ...userIdParamValidator,
  body("reason").optional({ nullable: true }).isString().withMessage("reason must be a string.")
];

export const suspendUserValidators = [
  ...userIdParamValidator,
  body("reason").optional({ nullable: true }).isString().withMessage("reason must be a string.")
];

export const reactivateUserValidators = [...userIdParamValidator];

export const updateUserRoleValidators = [
  ...userIdParamValidator,
  body("platformRole")
    .isIn(["business_owner", "admin"])
    .withMessage("platformRole is invalid.")
];

export const updateUserProfileValidators = [
  ...userIdParamValidator,
  body("fullName")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("fullName is required.")
    .isLength({ min: 2, max: 120 })
    .withMessage("fullName must be between 2 and 120 characters."),
  body("organizationId")
    .optional({ nullable: true })
    .custom((value) => value === null || value === "" || (typeof value === "string" && /^[0-9a-fA-F-]{36}$/.test(value)))
    .withMessage("organizationId must be a valid UUID.")
];

export const listOrganizationsValidators = [
  query("q").optional().isString().withMessage("q must be a string."),
  query("page").optional().isInt({ min: 1 }).withMessage("page must be 1 or greater."),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("limit must be between 1 and 100.")
];

export const createOrganizationValidators = [
  body("name")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("name is required.")
    .isLength({ min: 2, max: 120 })
    .withMessage("name must be between 2 and 120 characters.")
];

export const listAuditLogsValidators = [
  query("action").optional().isString().withMessage("action must be a string."),
  query("targetType").optional().isString().withMessage("targetType must be a string."),
  query("page").optional().isInt({ min: 1 }).withMessage("page must be 1 or greater."),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("limit must be between 1 and 100.")
];
