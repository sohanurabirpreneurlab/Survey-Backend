export type InvitationStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "opened"
  | "started"
  | "completed"
  | "bounced"
  | "failed"
  | "revoked"
  | "expired";

export type SurveyInvitation = {
  id: string;
  surveyId: string;
  recipientEmailCiphertext: string | null;
  recipientEmailHash: string;
  tokenHash: string;
  status: InvitationStatus;
  maxResponses: number;
  responseCount: number;
  expiresAt: string | null;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  revokedAt: string | null;
  metadata: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type InvitationListItem = Omit<SurveyInvitation, "tokenHash" | "recipientEmailCiphertext"> & {
  recipientEmail: string | null;
};

export type EmailDelivery = {
  id: string;
  campaignId: string | null;
  invitationId: string;
  provider: string;
  providerMessageId: string | null;
  status: "pending" | "sent" | "delivered" | "bounced" | "failed" | "complained" | "blocked";
  attemptCount: number;
  lastAttemptAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  bouncedAt: string | null;
  failedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  providerMetadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CreateInvitationInput = {
  createdBy: string;
  expiresAt: string | null;
  maxResponses: number;
  metadata: Record<string, unknown>;
  recipientEmailCiphertext: string;
  recipientEmailHash: string;
  surveyId: string;
  tokenHash: string;
};

export type RotateInvitationTokenInput = {
  invitationId: string;
  tokenHash: string;
  updatedBy: string;
};

export type CreateEmailDeliveryInput = {
  invitationId: string;
  provider: string;
  status: EmailDelivery["status"];
};

export type UpdateEmailDeliveryStatusInput = {
  deliveryId: string;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  providerMessageId?: string | null;
  providerMetadata?: Record<string, unknown>;
  status: EmailDelivery["status"];
};

export type SendInvitationEmailInput = {
  expiresAt: string | null;
  invitationUrl: string;
  recipientEmail: string;
  surveySlug: string;
  surveyTitle: string;
};

export type SendInvitationEmailResult = {
  provider: string;
  providerMessageId: string | null;
  status: "sent" | "failed";
};
