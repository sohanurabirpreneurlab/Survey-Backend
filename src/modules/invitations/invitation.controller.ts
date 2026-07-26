import type { Request, Response } from "express";

import { sendCreated, sendSuccess } from "../../common/http/api-response";
import { InvitationService } from "./invitation.service";

const invitationService = new InvitationService();
const getParam = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value ?? "");

export const createInvitation = async (request: Request, response: Response): Promise<void> => {
  const invitation = await invitationService.createInvitation({
    createdBy: request.admin!.userId,
    expiresAt: request.body.expiresAt ?? null,
    maxResponses: request.body.maxResponses ?? 1,
    recipientEmail: request.body.recipientEmail,
    surveyId: getParam(request.params.surveyId)
  });

  sendCreated(response, "Invitation created successfully.", invitation);
};

export const listInvitations = async (request: Request, response: Response): Promise<void> => {
  const invitations = await invitationService.listInvitations(
    getParam(request.params.surveyId),
    request.admin!.userId
  );
  sendSuccess(response, "Invitations retrieved successfully.", invitations);
};

export const revokeInvitation = async (request: Request, response: Response): Promise<void> => {
  const invitation = await invitationService.revokeInvitation(
    getParam(request.params.surveyId),
    getParam(request.params.invitationId),
    request.admin!.userId
  );
  sendSuccess(response, "Invitation revoked successfully.", invitation);
};

export const resendInvitation = async (request: Request, response: Response): Promise<void> => {
  const invitation = await invitationService.resendInvitation(
    getParam(request.params.surveyId),
    getParam(request.params.invitationId),
    request.admin!.userId
  );
  sendSuccess(response, "Invitation resent successfully.", invitation);
};
