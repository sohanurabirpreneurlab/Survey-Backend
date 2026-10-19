import { Router } from "express";
import { param, query } from "express-validator";
import { asyncHandler } from "../../common/http/async-handler";
import { authenticateAdmin } from "../../common/middleware/authenticate-admin";
import { validateRequest } from "../../common/middleware/validate-request";
import { listTrash, permanentlyDeleteTrashItem, restoreTrashItem } from "./trash.controller";
import { trashEntityTypes } from "./trash.types";

const trashRouter = Router();
const listValidators = [
  query("type").optional().isIn(["all", ...trashEntityTypes]).withMessage("type is invalid."),
  query("q").optional().isString().isLength({ max: 200 }).withMessage("q must be at most 200 characters."),
  query("page").optional().isInt({ min: 1 }).withMessage("page must be a positive integer."),
  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("limit must be between 1 and 100.")
];
const itemValidators = [
  param("entityType").isIn(trashEntityTypes).withMessage("entityType is invalid."),
  param("id").isUUID().withMessage("id must be a valid UUID.")
];

trashRouter.use(authenticateAdmin);
trashRouter.get("/", listValidators, validateRequest, asyncHandler(listTrash));
trashRouter.post("/:entityType/:id/restore", itemValidators, validateRequest, asyncHandler(restoreTrashItem));
trashRouter.delete("/:entityType/:id", itemValidators, validateRequest, asyncHandler(permanentlyDeleteTrashItem));

export { trashRouter };
