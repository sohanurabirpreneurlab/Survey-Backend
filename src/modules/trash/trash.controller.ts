import type { Request, Response } from "express";
import { sendSuccess } from "../../common/http/api-response";
import { TrashService } from "./trash.service";
import type { TrashEntityType } from "./trash.types";

const trashService = new TrashService();
const parsePositiveInteger = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const listTrash = async (request: Request, response: Response): Promise<void> => {
  const result = await trashService.list({
    entityType: request.query.type && request.query.type !== "all" ? request.query.type as TrashEntityType : undefined,
    limit: parsePositiveInteger(request.query.limit, 20),
    page: parsePositiveInteger(request.query.page, 1),
    query: typeof request.query.q === "string" ? request.query.q : undefined
  });
  response.status(200).json({
    success: true,
    message: "Trash items retrieved successfully.",
    data: result.items,
    meta: {
      pagination: { limit: result.limit, page: result.page, total: result.total, totalPages: result.totalPages },
      requestId: request.requestId ?? null
    }
  });
};

export const restoreTrashItem = async (request: Request, response: Response): Promise<void> => {
  await trashService.restore(request.params.entityType as TrashEntityType, String(request.params.id), request.admin!.userId);
  sendSuccess(response, "Trash item restored successfully.", null);
};

export const permanentlyDeleteTrashItem = async (request: Request, response: Response): Promise<void> => {
  await trashService.permanentlyDelete(request.params.entityType as TrashEntityType, String(request.params.id), request.admin!.userId);
  sendSuccess(response, "Trash item permanently deleted.", null);
};
