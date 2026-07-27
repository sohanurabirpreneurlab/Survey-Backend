import { Router } from "express";

import { asyncHandler } from "../../common/http/async-handler";
import { authenticateAdmin } from "../../common/middleware/authenticate-admin";
import { validateRequest } from "../../common/middleware/validate-request";
import {
  approveUser,
  createOrganization,
  getDashboardSummary,
  getOrganizationDetail,
  getUserDetail,
  listAuditLogs,
  listOrganizations,
  listUsers,
  reactivateUser,
  rejectUser,
  suspendUser
  ,
  updateUserRole
} from "./admin.controller";
import {
  approveUserValidators,
  createOrganizationValidators,
  listAuditLogsValidators,
  listOrganizationsValidators,
  listUsersValidators,
  organizationIdParamValidator,
  reactivateUserValidators,
  rejectUserValidators,
  suspendUserValidators,
  updateUserRoleValidators,
  userIdParamValidator
} from "./admin.validators";

const adminRouter = Router();

adminRouter.use(authenticateAdmin);

adminRouter.get("/dashboard-summary", asyncHandler(getDashboardSummary));
adminRouter.get("/users", listUsersValidators, validateRequest, asyncHandler(listUsers));
adminRouter.get("/users/:userId", userIdParamValidator, validateRequest, asyncHandler(getUserDetail));
adminRouter.post("/users/:userId/approve", approveUserValidators, validateRequest, asyncHandler(approveUser));
adminRouter.post("/users/:userId/reject", rejectUserValidators, validateRequest, asyncHandler(rejectUser));
adminRouter.post("/users/:userId/suspend", suspendUserValidators, validateRequest, asyncHandler(suspendUser));
adminRouter.post(
  "/users/:userId/reactivate",
  reactivateUserValidators,
  validateRequest,
  asyncHandler(reactivateUser)
);
adminRouter.patch("/users/:userId/role", updateUserRoleValidators, validateRequest, asyncHandler(updateUserRole));
adminRouter.post("/organizations", createOrganizationValidators, validateRequest, asyncHandler(createOrganization));
adminRouter.get(
  "/organizations",
  listOrganizationsValidators,
  validateRequest,
  asyncHandler(listOrganizations)
);
adminRouter.get(
  "/organizations/:organizationId",
  organizationIdParamValidator,
  validateRequest,
  asyncHandler(getOrganizationDetail)
);
adminRouter.get("/audit-logs", listAuditLogsValidators, validateRequest, asyncHandler(listAuditLogs));

export { adminRouter };
