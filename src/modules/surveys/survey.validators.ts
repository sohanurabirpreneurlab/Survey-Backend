import { body, param, query } from "express-validator";

const isOptionalIsoDate = (value: unknown): boolean => value === null || value === undefined || !Number.isNaN(Date.parse(String(value)));

export const surveyIdParamValidator = [
  param("surveyId").isUUID().withMessage("surveyId must be a valid UUID.")
];

export const versionIdParamValidator = [
  param("versionId").isUUID().withMessage("versionId must be a valid UUID.")
];

export const sectionIdParamValidator = [
  param("sectionId").isUUID().withMessage("sectionId must be a valid UUID.")
];

export const questionIdParamValidator = [
  param("questionId").isUUID().withMessage("questionId must be a valid UUID.")
];

export const optionIdParamValidator = [
  param("optionId").isUUID().withMessage("optionId must be a valid UUID.")
];

export const createSurveyValidators = [
  body("organizationId").isUUID().withMessage("organizationId must be a valid UUID."),
  body("slug").isString().trim().notEmpty().withMessage("slug is required."),
  body("title").isString().trim().notEmpty().withMessage("title is required."),
  body("description").optional({ nullable: true }).isString().withMessage("description must be a string."),
  body("accessMode")
    .isIn(["public", "invite_only", "authenticated", "organization_only"])
    .withMessage("accessMode is invalid."),
  body("opensAt").optional({ nullable: true }).custom(isOptionalIsoDate).withMessage("opensAt must be a valid date or null."),
  body("closesAt").optional({ nullable: true }).custom(isOptionalIsoDate).withMessage("closesAt must be a valid date or null."),
  body("responseLimit").optional({ nullable: true }).isInt({ min: 1 }).withMessage("responseLimit must be a positive integer or null.")
];

export const listSurveysValidators = [
  query("organizationId").optional().isUUID().withMessage("organizationId must be a valid UUID."),
  query("page").optional().isInt({ min: 1 }).withMessage("page must be 1 or greater."),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("limit must be between 1 and 100.")
];

export const updateSurveyValidators = [
  ...surveyIdParamValidator,
  body("slug").isString().trim().notEmpty().withMessage("slug is required."),
  body("accessMode")
    .isIn(["public", "invite_only", "authenticated", "organization_only"])
    .withMessage("accessMode is invalid."),
  body("opensAt").optional({ nullable: true }).custom(isOptionalIsoDate).withMessage("opensAt must be a valid date or null."),
  body("closesAt").optional({ nullable: true }).custom(isOptionalIsoDate).withMessage("closesAt must be a valid date or null."),
  body("responseLimit").optional({ nullable: true }).isInt({ min: 1 }).withMessage("responseLimit must be a positive integer or null.")
];

export const createDraftValidators = [...surveyIdParamValidator];
export const publishDraftValidators = [...surveyIdParamValidator];
export const closeSurveyValidators = [...surveyIdParamValidator];
export const reopenSurveyValidators = [...surveyIdParamValidator];
export const compareVersionsValidators = [
  ...surveyIdParamValidator,
  query("fromVersionId").isUUID().withMessage("fromVersionId must be a valid UUID."),
  query("toVersionId").isUUID().withMessage("toVersionId must be a valid UUID.")
];

export const createSectionValidators = [
  ...surveyIdParamValidator,
  body("title").isString().trim().notEmpty().withMessage("title is required."),
  body("description").optional({ nullable: true }).isString().withMessage("description must be a string."),
  body("position").isInt({ min: 0 }).withMessage("position must be zero or greater.")
];

export const updateSectionValidators = [
  ...surveyIdParamValidator,
  ...sectionIdParamValidator,
  body("title").isString().trim().notEmpty().withMessage("title is required."),
  body("description").optional({ nullable: true }).isString().withMessage("description must be a string."),
  body("position").isInt({ min: 0 }).withMessage("position must be zero or greater.")
];

export const deleteSectionValidators = [...surveyIdParamValidator, ...sectionIdParamValidator];

export const reorderSectionsValidators = [
  ...surveyIdParamValidator,
  body("items").isArray({ min: 1 }).withMessage("items must be a non-empty array."),
  body("items.*.sectionId").isUUID().withMessage("sectionId must be a valid UUID."),
  body("items.*.position").isInt({ min: 0 }).withMessage("position must be zero or greater.")
];

export const createQuestionValidators = [
  ...surveyIdParamValidator,
  body("sectionId").isUUID().withMessage("sectionId must be a valid UUID."),
  body("type")
    .isIn(["short_text", "long_text", "single_choice", "multiple_choice", "yes_no", "rating", "vote"])
    .withMessage("type is invalid."),
  body("title").isString().trim().notEmpty().withMessage("title is required."),
  body("description").optional({ nullable: true }).isString().withMessage("description must be a string."),
  body("required").isBoolean().withMessage("required must be a boolean."),
  body("position").isInt({ min: 0 }).withMessage("position must be zero or greater."),
  body("options").optional().isArray().withMessage("options must be an array when provided.")
];

export const updateQuestionValidators = [
  ...surveyIdParamValidator,
  ...questionIdParamValidator,
  body("type")
    .isIn(["short_text", "long_text", "single_choice", "multiple_choice", "yes_no", "rating", "vote"])
    .withMessage("type is invalid."),
  body("title").isString().trim().notEmpty().withMessage("title is required."),
  body("description").optional({ nullable: true }).isString().withMessage("description must be a string."),
  body("required").isBoolean().withMessage("required must be a boolean."),
  body("position").isInt({ min: 0 }).withMessage("position must be zero or greater."),
  body("confirmRemoveOptions").optional().isBoolean().withMessage("confirmRemoveOptions must be a boolean.")
];

export const deleteQuestionValidators = [...surveyIdParamValidator, ...questionIdParamValidator];

export const reorderQuestionsValidators = [
  ...surveyIdParamValidator,
  body("sectionId").isUUID().withMessage("sectionId must be a valid UUID."),
  body("items").isArray({ min: 1 }).withMessage("items must be a non-empty array."),
  body("items.*.questionId").isUUID().withMessage("questionId must be a valid UUID."),
  body("items.*.position").isInt({ min: 0 }).withMessage("position must be zero or greater.")
];

export const createOptionValidators = [
  ...surveyIdParamValidator,
  ...questionIdParamValidator,
  body("label").isString().trim().notEmpty().withMessage("label is required."),
  body("value").isString().trim().notEmpty().withMessage("value is required."),
  body("position").isInt({ min: 0 }).withMessage("position must be zero or greater.")
];

export const updateOptionValidators = [
  ...surveyIdParamValidator,
  ...questionIdParamValidator,
  ...optionIdParamValidator,
  body("label").isString().trim().notEmpty().withMessage("label is required."),
  body("value").isString().trim().notEmpty().withMessage("value is required."),
  body("position").isInt({ min: 0 }).withMessage("position must be zero or greater.")
];

export const deleteOptionValidators = [...surveyIdParamValidator, ...questionIdParamValidator, ...optionIdParamValidator];

export const reorderOptionsValidators = [
  ...surveyIdParamValidator,
  ...questionIdParamValidator,
  body("items").isArray({ min: 1 }).withMessage("items must be a non-empty array."),
  body("items.*.optionId").isUUID().withMessage("optionId must be a valid UUID."),
  body("items.*.position").isInt({ min: 0 }).withMessage("position must be zero or greater.")
];
