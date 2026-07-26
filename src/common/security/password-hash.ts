import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";

import { AppError } from "../errors/app-error";
import { ERROR_CODES } from "../errors/error-codes";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const HASH_VERSION = "scrypt.v1";

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16);
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;

  return [
    HASH_VERSION,
    salt.toString("base64"),
    derivedKey.toString("base64")
  ].join(":");
};

export const verifyPassword = async (
  password: string,
  storedHash: string
): Promise<boolean> => {
  const [version, saltBase64, hashBase64] = storedHash.split(":");

  if (version !== HASH_VERSION || !saltBase64 || !hashBase64) {
    throw new AppError(
      ERROR_CODES.internalServerError,
      "The stored password hash format is invalid.",
      500
    );
  }

  const salt = Buffer.from(saltBase64, "base64");
  const expectedHash = Buffer.from(hashBase64, "base64");
  const derivedKey = (await scrypt(password, salt, expectedHash.length)) as Buffer;

  return (
    expectedHash.length === derivedKey.length &&
    timingSafeEqual(expectedHash, derivedKey)
  );
};
