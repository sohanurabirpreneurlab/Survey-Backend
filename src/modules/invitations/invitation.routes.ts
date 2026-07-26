import { Router } from "express";

import { asyncHandler } from "../../common/http/async-handler";
import { validateRequest } from "../../common/middleware/validate-request";
import { createInvitation, listInvitations, resendInvitation, revokeInvitation } from "./invitation.controller";
import { createInvitationValidators, invitationIdRouteParams, invitationRouteParams } from "./invitation.validators";

const invitationRouter = Router({ mergeParams: true });

invitationRouter.post("/", createInvitationValidators, validateRequest, asyncHandler(createInvitation));
invitationRouter.get("/", invitationRouteParams, validateRequest, asyncHandler(listInvitations));
invitationRouter.post("/:invitationId/revoke", invitationIdRouteParams, validateRequest, asyncHandler(revokeInvitation));
invitationRouter.post("/:invitationId/resend", invitationIdRouteParams, validateRequest, asyncHandler(resendInvitation));

export { invitationRouter };
