import { body } from "express-validator";

export const respondentAccessValidators = [
  body("token").isString().trim().notEmpty().withMessage("token is required.")
];
