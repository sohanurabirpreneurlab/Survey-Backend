import { createHash } from "crypto";

export const createRequestHash = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
