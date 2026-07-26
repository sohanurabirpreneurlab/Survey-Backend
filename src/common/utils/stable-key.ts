import { randomUUID } from "crypto";

export const createStableKey = (prefix: "sec" | "q" | "opt"): string => {
  // Stable keys identify the same logical entity across versions, while row IDs
  // identify one specific stored record in one specific version snapshot.
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
};
