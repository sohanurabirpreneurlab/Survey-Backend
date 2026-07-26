import type { Request, Response } from "express";

import { sendSuccess } from "../../common/http/api-response";

export const getHealth = (_request: Request, response: Response): void => {
  sendSuccess(response, "Backend is healthy.", {
    status: "ok"
  });
};
