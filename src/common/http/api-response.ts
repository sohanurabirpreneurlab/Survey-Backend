import type { Response } from "express";

type ResponseMeta = {
  requestId: string | null;
};

export const sendSuccess = <T>(
  response: Response,
  message: string,
  data: T,
  statusCode = 200
): void => {
  response.status(statusCode).json({
    success: true,
    message,
    data,
    meta: buildMeta(response)
  });
};

export const sendCreated = <T>(response: Response, message: string, data: T): void => {
  sendSuccess(response, message, data, 201);
};

export const sendNoContent = (response: Response): void => {
  response.status(204).send();
};

const buildMeta = (response: Response): ResponseMeta => ({
  requestId: response.req.requestId ?? null
});
