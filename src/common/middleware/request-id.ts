import type { NextFunction, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";

export const requestId = (request: Request, response: Response, next: NextFunction): void => {
  const incomingRequestId = request.header("x-request-id");
  const resolvedRequestId = incomingRequestId && incomingRequestId.trim() !== "" ? incomingRequestId : uuidv4();

  request.requestId = resolvedRequestId;
  response.setHeader("x-request-id", resolvedRequestId);

  next();
};
