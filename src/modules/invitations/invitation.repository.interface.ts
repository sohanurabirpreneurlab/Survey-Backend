import type {
  CreateEmailDeliveryInput,
  CreateInvitationInput,
  EmailDelivery,
  RotateInvitationTokenInput,
  SurveyInvitation,
  UpdateEmailDeliveryStatusInput
} from "./invitation.types";

export interface IInvitationRepository {
  createInvitation(input: CreateInvitationInput): Promise<SurveyInvitation>;
  listSurveyInvitations(surveyId: string): Promise<SurveyInvitation[]>;
  findInvitationById(invitationId: string): Promise<SurveyInvitation | null>;
  findInvitationByTokenHash(tokenHash: string): Promise<SurveyInvitation | null>;
  findActiveInvitationByEmailHash(surveyId: string, recipientEmailHash: string): Promise<SurveyInvitation | null>;
  rotateInvitationToken(input: RotateInvitationTokenInput): Promise<SurveyInvitation>;
  revokeInvitation(invitationId: string): Promise<SurveyInvitation>;
  updateInvitationStatus(invitationId: string, status: SurveyInvitation["status"]): Promise<SurveyInvitation>;
  markInvitationOpened(invitationId: string): Promise<void>;
  createEmailDelivery(input: CreateEmailDeliveryInput): Promise<EmailDelivery>;
  updateEmailDeliveryStatus(input: UpdateEmailDeliveryStatusInput): Promise<EmailDelivery>;
}
