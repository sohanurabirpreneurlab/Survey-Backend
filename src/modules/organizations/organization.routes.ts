import { Router } from "express";

import { asyncHandler } from "../../common/http/async-handler";
import { authenticateUser } from "../../common/middleware/authenticate-user";
import { requireApprovedAccount } from "../../common/middleware/require-approved-account";
import { validateRequest } from "../../common/middleware/validate-request";
import { createOrganization, getOrganization } from "./organization.controller";
import { createOrganizationValidators, organizationIdParamValidators } from "./organization.validators";

const organizationRouter = Router();

organizationRouter.post(
  "/",
  authenticateUser,
  requireApprovedAccount,
  createOrganizationValidators,
  validateRequest,
  asyncHandler(createOrganization)
);

organizationRouter.get(
  "/:organizationId",
  authenticateUser,
  requireApprovedAccount,
  organizationIdParamValidators,
  validateRequest,
  asyncHandler(getOrganization)
);

export { organizationRouter };
