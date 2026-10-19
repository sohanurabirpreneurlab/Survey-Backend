import { AppError } from "../../common/errors/app-error";
import { ERROR_CODES } from "../../common/errors/error-codes";
import { TrashRepository } from "./trash.repository";
import type { TrashEntityType } from "./trash.types";

export class TrashService {
  public constructor(private readonly trashRepository = new TrashRepository()) {}

  public list(input: { entityType?: TrashEntityType; limit: number; page: number; query?: string }) {
    return this.trashRepository.list(input);
  }

  public async restore(entityType: TrashEntityType, id: string, actorUserId: string): Promise<void> {
    const restored = await this.trashRepository.restore(entityType, id, actorUserId);
    if (!restored) throw new AppError(ERROR_CODES.resourceNotFound, "Trash item was not found.", 404);
  }

  public async permanentlyDelete(entityType: TrashEntityType, id: string, actorUserId: string): Promise<void> {
    if (entityType === "user" && id === actorUserId) {
      throw new AppError(ERROR_CODES.forbidden, "You cannot permanently delete your own account.", 403);
    }
    const deleted = await this.trashRepository.permanentlyDelete(entityType, id, actorUserId);
    if (!deleted) throw new AppError(ERROR_CODES.resourceNotFound, "Trash item was not found.", 404);
  }
}
