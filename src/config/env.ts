import dotenv from "dotenv";

import { AppError } from "../common/errors/app-error";
import { ERROR_CODES } from "../common/errors/error-codes";

dotenv.config();

type NodeEnvironment = "development" | "test" | "production";

export type Env = {
  nodeEnv: NodeEnvironment;
  port: number;
  appBaseUrl: string;
  databaseUrl: string;
  authAccessTokenTtlMinutes: number;
  authJwtSecret: string | null;
  authPasswordResetRedirectUrl: string | null;
  authRefreshTokenTtlDays: number;
  invitationEmailHashSecret: string | null;
  invitationEmailEncryptionKey: string | null;
  respondentSessionSecret: string | null;
  brevoApiKey: string | null;
  brevoSenderEmail: string | null;
  brevoSenderName: string | null;
  respondentCookieName: string | null;
  respondentSessionTtlMinutes: number | null;
};

const getRequired = (key: string): string => {
  const value = process.env[key];

  if (!value || value.trim() === "") {
    throw new AppError(
      ERROR_CODES.internalServerError,
      `Missing required environment variable: ${key}`,
      500
    );
  }

  return value;
};

const getOptional = (key: string): string | null => {
  const value = process.env[key];

  if (!value || value.trim() === "") {
    return null;
  }

  return value;
};

const getNodeEnv = (): NodeEnvironment => {
  const value = process.env.NODE_ENV ?? "development";

  if (value === "development" || value === "test" || value === "production") {
    return value;
  }

  throw new AppError(
    ERROR_CODES.internalServerError,
    "NODE_ENV must be development, test, or production.",
    500
  );
};

const getPort = (): number => {
  const parsedValue = Number(process.env.PORT ?? "4000");

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new AppError(ERROR_CODES.internalServerError, "PORT must be a positive integer.", 500);
  }

  return parsedValue;
};

const getNumberWithDefault = (key: string, fallbackValue: number): number => {
  const value = getOptional(key);

  if (value === null) {
    return fallbackValue;
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw new AppError(
      ERROR_CODES.internalServerError,
      `${key} must be a positive number.`,
      500
    );
  }

  return parsedValue;
};

const getPositiveNumber = (key: string): number => {
  const parsedValue = Number(getRequired(key));

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw new AppError(
      ERROR_CODES.internalServerError,
      `${key} must be a positive number.`,
      500
    );
  }

  return parsedValue;
};

const getOptionalPositiveNumber = (key: string): number | null => {
  const value = getOptional(key);

  if (value === null) {
    return null;
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw new AppError(
      ERROR_CODES.internalServerError,
      `${key} must be a positive number.`,
      500
    );
  }

  return parsedValue;
};

const getRequiredKey = (key: string, expectedBytes: number): string => {
  const value = getRequired(key);
  const buffer = Buffer.from(value, "base64");

  if (buffer.length !== expectedBytes) {
    throw new AppError(
      ERROR_CODES.internalServerError,
      `${key} must be a base64-encoded ${expectedBytes}-byte value.`,
      500
    );
  }

  return value;
};

const getOptionalKey = (key: string, expectedBytes: number): string | null => {
  const value = getOptional(key);

  if (value === null) {
    return null;
  }

  const buffer = Buffer.from(value, "base64");

  if (buffer.length !== expectedBytes) {
    throw new AppError(
      ERROR_CODES.internalServerError,
      `${key} must be a base64-encoded ${expectedBytes}-byte value.`,
      500
    );
  }

  return value;
};

export const env: Env = {
  nodeEnv: getNodeEnv(),
  port: getPort(),
  appBaseUrl: getRequired("FRONTEND_URL"),
  authAccessTokenTtlMinutes: getNumberWithDefault("AUTH_ACCESS_TOKEN_TTL_MINUTES", 15),
  authJwtSecret: getOptional("AUTH_JWT_SECRET"),
  authPasswordResetRedirectUrl: getOptional("AUTH_PASSWORD_RESET_REDIRECT_URL"),
  authRefreshTokenTtlDays: getNumberWithDefault("AUTH_REFRESH_TOKEN_TTL_DAYS", 30),
  databaseUrl: getRequired("DATABASE_URL"),
  invitationEmailHashSecret: getOptional("INVITATION_EMAIL_HASH_SECRET"),
  invitationEmailEncryptionKey: getOptionalKey("INVITATION_EMAIL_ENCRYPTION_KEY", 32),
  respondentSessionSecret: getOptional("RESPONDENT_SESSION_SECRET"),
  brevoApiKey: getOptional("BREVO_API_KEY"),
  brevoSenderEmail: getOptional("BREVO_SENDER_EMAIL"),
  brevoSenderName: getOptional("BREVO_SENDER_NAME"),
  respondentCookieName: getOptional("RESPONDENT_COOKIE_NAME"),
  respondentSessionTtlMinutes: getOptionalPositiveNumber("RESPONDENT_SESSION_TTL_MINUTES")
};
