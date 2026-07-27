import { body, checkExact } from "express-validator";

const emailRules = () =>
  body("email")
    .exists()
    .withMessage("email is required.")
    .bail()
    .isString()
    .withMessage("email must be a string.")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("email is required.")
    .bail()
    .isLength({ max: 254 })
    .withMessage("email must be 254 characters or fewer.")
    .bail()
    .isEmail()
    .withMessage("email must be a valid email.")
    .bail()
    .normalizeEmail({
      all_lowercase: true,
      gmail_remove_dots: false,
      outlookdotcom_remove_subaddress: false,
      yahoo_remove_subaddress: false
    });

const passwordRules = () =>
  body("password")
    .exists()
    .withMessage("password is required.")
    .bail()
    .isString()
    .withMessage("password must be a string.")
    .bail()
    .isLength({ min: 10, max: 128 })
    .withMessage("password must be between 10 and 128 characters long.")
    .bail()
    .matches(/[a-z]/)
    .withMessage("password must include a lowercase letter.")
    .bail()
    .matches(/[A-Z]/)
    .withMessage("password must include an uppercase letter.")
    .bail()
    .matches(/[0-9]/)
    .withMessage("password must include a number.")
    .bail()
    .matches(/[^A-Za-z0-9]/)
    .withMessage("password must include a special character.")
    .bail()
    .matches(/^\S+$/)
    .withMessage("password must not contain spaces.");

const loginPasswordRules = () =>
  body("password")
    .exists()
    .withMessage("password is required.")
    .bail()
    .isString()
    .withMessage("password must be a string.")
    .bail()
    .isLength({ min: 1, max: 128 })
    .withMessage("password must be between 1 and 128 characters long.")
    .bail()
    .matches(/^\S+$/)
    .withMessage("password must not contain spaces.");

const fullNameRules = () =>
  body("fullName")
    .exists()
    .withMessage("fullName is required.")
    .bail()
    .isString()
    .withMessage("fullName must be a string.")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("fullName is required.")
    .bail()
    .isLength({ min: 2, max: 120 })
    .withMessage("fullName must be between 2 and 120 characters.")
    .bail()
    .matches(/^[A-Za-z0-9.' -]+$/)
    .withMessage("fullName contains invalid characters.");

const organizationIdRules = () =>
  body("organizationId")
    .exists()
    .withMessage("organizationId is required.")
    .bail()
    .isString()
    .withMessage("organizationId must be a string.")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("organizationId is required.")
    .bail()
    .isUUID()
    .withMessage("organizationId must be a valid UUID.");

export const registerValidators = [
  checkExact(
    [
      emailRules(),
      passwordRules(),
      fullNameRules(),
      organizationIdRules()
    ],
    {
      message: "The registration payload contains unknown or unsupported fields."
    }
  ),
];

export const loginValidators = [
  checkExact(
    [
      emailRules(),
      loginPasswordRules()
    ],
    {
      message: "The login payload contains unknown or unsupported fields."
    }
  )
];

export const refreshValidators = [
  checkExact(
    [
      body("refreshToken")
        .exists()
        .withMessage("refreshToken is required.")
        .bail()
        .isString()
        .withMessage("refreshToken must be a string.")
        .bail()
        .trim()
        .notEmpty()
        .withMessage("refreshToken is required.")
    ],
    {
      message: "The refresh payload contains unknown or unsupported fields."
    }
  )
];

export const forgotPasswordValidators = [
  checkExact(
    [
      emailRules()
    ],
    {
      message: "The forgot-password payload contains unknown or unsupported fields."
    }
  )
];

export const resetPasswordValidators = [
  checkExact(
    [
      body("newPassword")
        .exists()
        .withMessage("newPassword is required.")
        .bail()
        .isString()
        .withMessage("newPassword must be a string.")
        .bail()
        .isLength({ min: 10, max: 128 })
        .withMessage("newPassword must be between 10 and 128 characters long.")
        .bail()
        .matches(/[a-z]/)
        .withMessage("newPassword must include a lowercase letter.")
        .bail()
        .matches(/[A-Z]/)
        .withMessage("newPassword must include an uppercase letter.")
        .bail()
        .matches(/[0-9]/)
        .withMessage("newPassword must include a number.")
        .bail()
        .matches(/[^A-Za-z0-9]/)
        .withMessage("newPassword must include a special character.")
        .bail()
        .matches(/^\S+$/)
        .withMessage("newPassword must not contain spaces.")
    ],
    {
      message: "The reset-password payload contains unknown or unsupported fields."
    }
  )
];
