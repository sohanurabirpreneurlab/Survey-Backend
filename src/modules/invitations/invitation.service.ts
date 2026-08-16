import { AppError } from "../../common/errors/app-error";
import { ERROR_CODES } from "../../common/errors/error-codes";
import { decryptEmail, encryptEmail, normalizeInvitationEmail, protectEmailForLookup } from "../../common/security/email-protection";
import { createSecureToken, hashToken } from "../../common/security/token-hash";
import { env } from "../../config/env";
import { OrganizationService } from "../organizations/organization.service";
import { SurveyRepository } from "../surveys/survey.repository";
import type { ISurveyRepository } from "../surveys/survey.repository.interface";
import { BrevoInvitationEmailProvider } from "./brevo-invitation-email.provider";
import type { IInvitationEmailProvider } from "./invitation-email-provider.interface";
import { InvitationRepository } from "./invitation.repository";
import type { IInvitationRepository } from "./invitation.repository.interface";
import type {
  CreateInvitationsBatchResult,
  InvitationFailure,
  InvitationListItem,
  InvitationRecipientInput,
  SurveyInvitation
} from "./invitation.types";

export class InvitationService {
  public constructor(
    private readonly invitationRepository: IInvitationRepository = new InvitationRepository(),
    private readonly surveyRepository: ISurveyRepository = new SurveyRepository(),
    private readonly organizationService = new OrganizationService(),
    private readonly emailProvider: IInvitationEmailProvider = new BrevoInvitationEmailProvider()
  ) {}

  public async createInvitation(input: {
    createdBy: string;
    expiresAt: string | null;
    maxResponses?: number;
    recipientEmail: string;
  surveyId: string;
  }): Promise<InvitationListItem> {
    const survey = await this.requireManageableSurvey(input.surveyId, input.createdBy);
    const publishedVersion = await this.requirePublishedVersion(survey.id, survey.slug);
    const result = await this.createAndDeliverInvitation({
      createdBy: input.createdBy,
      expiresAt: input.expiresAt,
      maxResponses: input.maxResponses ?? 1,
      publishedVersionDescription: publishedVersion.description,
      publishedVersionId: publishedVersion.id,
      publishedVersionTitle: publishedVersion.title,
      recipientEmail: input.recipientEmail,
      surveyId: survey.id
    });

    if (result.failure) {
      throw new AppError(
        ERROR_CODES.invitationSendFailed,
        result.failure.message,
        result.failure.code === ERROR_CODES.invitationEmailAlreadyExists ? 409 : 502
      );
    }

    return result.invitation;
  }

  public async createInvitationsBatch(input: {
    createdBy: string;
    expiresAt: string | null;
    maxResponses?: number;
    recipients: InvitationRecipientInput[];
    surveyId: string;
  }): Promise<CreateInvitationsBatchResult> {
    const survey = await this.requireManageableSurvey(input.surveyId, input.createdBy);
    const publishedVersion = await this.requirePublishedVersion(survey.id, survey.slug);

    const invitations: InvitationListItem[] = [];
    const failedRecipients: InvitationFailure[] = [];
    const seenEmails = new Set<string>();
    let sentCount = 0;

    for (const recipient of input.recipients) {
      const normalizedEmail = normalizeInvitationEmail(recipient.email);

      if (seenEmails.has(normalizedEmail)) {
        failedRecipients.push({
          email: normalizedEmail,
          message: "Duplicate recipient emails are not allowed in the same request."
        });
        continue;
      }

      seenEmails.add(normalizedEmail);

      const result = await this.createAndDeliverInvitation({
        createdBy: input.createdBy,
        expiresAt: input.expiresAt,
        maxResponses: input.maxResponses ?? 1,
        publishedVersionDescription: publishedVersion.description,
        publishedVersionId: publishedVersion.id,
        publishedVersionTitle: publishedVersion.title,
        recipientEmail: normalizedEmail,
        surveyId: survey.id
      });

      if (result.failure) {
        failedRecipients.push(result.failure);
        continue;
      }

      invitations.push(result.invitation);
      sentCount += 1;
    }

    return {
      createdCount: invitations.length,
      failedCount: failedRecipients.length,
      failedRecipients,
      invitations,
      sentCount
    };
  }

  public async listInvitations(surveyId: string, userId: string): Promise<InvitationListItem[]> {
    await this.requireManageableSurvey(surveyId, userId);
    const invitations = await this.invitationRepository.listSurveyInvitations(surveyId);
    return invitations.map((invitation) => this.toListItem(invitation));
  }

  public async revokeInvitation(
    surveyId: string,
    invitationId: string,
    userId: string
  ): Promise<InvitationListItem> {
    await this.requireManageableSurvey(surveyId, userId);
    const invitation = await this.invitationRepository.findInvitationById(invitationId);

    if (!invitation || invitation.surveyId !== surveyId) {
      throw new AppError(ERROR_CODES.invitationNotFound, "Invitation was not found.", 404);
    }

    return this.toListItem(await this.invitationRepository.revokeInvitation(invitationId));
  }

  public async resendInvitation(
    surveyId: string,
    invitationId: string,
    userId: string
  ): Promise<InvitationListItem> {
    const survey = await this.requireManageableSurvey(surveyId, userId);
    const invitation = await this.invitationRepository.findInvitationById(invitationId);

    if (!invitation || invitation.surveyId !== surveyId) {
      throw new AppError(ERROR_CODES.invitationNotFound, "Invitation was not found.", 404);
    }

    if (invitation.revokedAt) {
      throw new AppError(
        ERROR_CODES.invitationResendNotAllowed,
        "Revoked invitations cannot be resent.",
        400
      );
    }

    if (!invitation.recipientEmailCiphertext) {
      throw new AppError(ERROR_CODES.invitationSendFailed, "The invitation email could not be recovered.", 500);
    }

    const issuedAccess = await this.issueInvitationAccessLink({
      createdBy: userId,
      expiresAt: invitation.expiresAt,
      maxResponses: invitation.maxResponses,
      metadata: invitation.metadata,
      recipientEmail: decryptEmail(invitation.recipientEmailCiphertext),
      reuseExistingInvitation: true,
      surveyId: invitation.surveyId,
      surveyVersionId: invitation.surveyVersionId
    });

    const delivery = await this.invitationRepository.createEmailDelivery({
      invitationId: invitation.id,
      provider: "brevo",
      status: "pending"
    });

    try {
      const publishedVersion = await this.requirePublishedVersion(survey.id, survey.slug);
      const sendResult = await this.emailProvider.sendInvitation({
        expiresAt: invitation.expiresAt,
        invitationUrl: issuedAccess.invitationUrl,
        recipientEmail: issuedAccess.recipientEmail,
        surveyDescription: publishedVersion.description,
        surveyTitle: publishedVersion.title
      });

      await this.invitationRepository.updateEmailDeliveryStatus({
        deliveryId: delivery.id,
        providerMessageId: sendResult.providerMessageId,
        status: "sent"
      });

      const sentInvitation = await this.invitationRepository.updateInvitationStatus(
        invitation.id,
        "sent"
      );

      return this.toListItem(sentInvitation);
    } catch (error) {
      await this.invitationRepository.updateEmailDeliveryStatus({
        deliveryId: delivery.id,
        lastErrorCode: error instanceof AppError ? error.code : ERROR_CODES.emailProviderError,
        lastErrorMessage: formatInvitationDeliveryError(error),
        providerMetadata: extractInvitationDeliveryErrorMetadata(error),
        status: "failed"
      });
      throw new AppError(ERROR_CODES.invitationSendFailed, "The invitation email could not be resent.", 502);
    }
  }

  public async issueInvitationAccessLink(input: {
    createdBy: string;
    expiresAt: string | null;
    maxResponses: number;
    metadata: Record<string, unknown>;
    recipientEmail: string;
    reuseExistingInvitation: boolean;
    surveyId: string;
    surveyVersionId: string;
  }): Promise<{
    invitation: SurveyInvitation;
    invitationUrl: string;
    recipientEmail: string;
  }> {
    const recipientEmail = normalizeInvitationEmail(input.recipientEmail);
    const recipientEmailHash = protectEmailForLookup(recipientEmail);
    const rawToken = createSecureToken();
    const tokenHash = hashToken(rawToken);

    if (!input.reuseExistingInvitation) {
      const existingInvitation = await this.invitationRepository.findActiveInvitationByEmailHash(
        input.surveyId,
        recipientEmailHash
      );

      if (existingInvitation) {
        throw new AppError(
          ERROR_CODES.invitationEmailAlreadyExists,
          "An active invitation already exists for this email.",
          409
        );
      }

      const invitation = await this.invitationRepository.createInvitation({
        createdBy: input.createdBy,
        expiresAt: input.expiresAt,
        maxResponses: input.maxResponses,
        metadata: input.metadata,
        recipientEmailCiphertext: encryptEmail(recipientEmail),
        recipientEmailHash,
        surveyId: input.surveyId,
        surveyVersionId: input.surveyVersionId,
        tokenHash
      });

      return {
        invitation,
        invitationUrl: `${env.appBaseUrl}/i/${rawToken}`,
        recipientEmail
      };
    }

    const ensuredInvitation = await this.invitationRepository.ensureInvitationWithAccessToken({
      createdBy: input.createdBy,
      expiresAt: input.expiresAt,
      maxResponses: input.maxResponses,
      metadata: input.metadata,
      recipientEmailCiphertext: encryptEmail(recipientEmail),
      recipientEmailHash,
      surveyId: input.surveyId,
      surveyVersionId: input.surveyVersionId,
      tokenHash
    });

    if (!ensuredInvitation.created) {
      await this.invitationRepository.createInvitationAccessToken({
        expiresAt: ensuredInvitation.invitation.expiresAt,
        invitationId: ensuredInvitation.invitation.id,
        tokenHash
      });
    }

    return {
      invitation: ensuredInvitation.invitation,
      invitationUrl: `${env.appBaseUrl}/i/${rawToken}`,
      recipientEmail
    };
  }

  public async hasSubmittedInvitationResponse(input: {
    recipientEmail: string;
    surveyId: string;
  }): Promise<boolean> {
    return this.invitationRepository.hasSubmittedResponse(
      input.surveyId,
      protectEmailForLookup(normalizeInvitationEmail(input.recipientEmail))
    );
  }

  private async requireManageableSurvey(surveyId: string, userId: string) {
    const survey = await this.surveyRepository.findSurveyById(surveyId);

    if (!survey) {
      throw new AppError(ERROR_CODES.surveyNotFound, "Survey was not found.", 404);
    }

    const membership = await this.organizationService.requireOrganizationMembership(
      survey.organizationId,
      userId
    );
    this.organizationService.requireSurveyPublishPermission(membership);
    return survey;
  }

  private async requirePublishedVersion(surveyId: string, surveySlug: string) {
    const publishedVersion = await this.surveyRepository.findPublishedVersion(surveyId);

    if (!publishedVersion) {
      throw new AppError(
        ERROR_CODES.surveyNotPublished,
        "Invitations can only be created for a published survey.",
        400
      );
    }

    return publishedVersion ?? { title: surveySlug };
  }

  private async createAndDeliverInvitation(input: {
    createdBy: string;
    expiresAt: string | null;
    maxResponses: number;
    publishedVersionDescription: string | null;
    publishedVersionId: string;
    publishedVersionTitle: string;
    recipientEmail: string;
    surveyId: string;
  }): Promise<{ failure: (InvitationFailure & { code: string }) | null; invitation: InvitationListItem }> {
    try {
      const issuedAccess = await this.issueInvitationAccessLink({
        createdBy: input.createdBy,
        expiresAt: input.expiresAt,
        maxResponses: input.maxResponses,
        metadata: {},
        recipientEmail: input.recipientEmail,
        reuseExistingInvitation: false,
        surveyId: input.surveyId,
        surveyVersionId: input.publishedVersionId
      });
      const delivery = await this.invitationRepository.createEmailDelivery({
        invitationId: issuedAccess.invitation.id,
        provider: "brevo",
        status: "pending"
      });

      try {
        const sendResult = await this.emailProvider.sendInvitation({
          expiresAt: input.expiresAt,
          invitationUrl: issuedAccess.invitationUrl,
          recipientEmail: issuedAccess.recipientEmail,
          surveyDescription: input.publishedVersionDescription,
          surveyTitle: input.publishedVersionTitle
        });

        await this.invitationRepository.updateEmailDeliveryStatus({
          deliveryId: delivery.id,
          providerMessageId: sendResult.providerMessageId,
          status: "sent"
        });

        const sentInvitation = await this.invitationRepository.updateInvitationStatus(
          issuedAccess.invitation.id,
          "sent"
        );

        return {
          failure: null,
          invitation: this.toListItem(sentInvitation)
        };
      } catch (error) {
        await this.invitationRepository.updateEmailDeliveryStatus({
          deliveryId: delivery.id,
          lastErrorCode: error instanceof AppError ? error.code : ERROR_CODES.emailProviderError,
          lastErrorMessage: formatInvitationDeliveryError(error),
          providerMetadata: extractInvitationDeliveryErrorMetadata(error),
          status: "failed"
        });

        const failedInvitation = await this.invitationRepository.updateInvitationStatus(
          issuedAccess.invitation.id,
          "failed"
        );

        return {
          failure: {
            code: ERROR_CODES.invitationSendFailed,
            email: issuedAccess.recipientEmail,
            message: "Invitation was created but the email could not be sent."
          },
          invitation: this.toListItem(failedInvitation)
        };
      }
    } catch (error) {
      if (error instanceof AppError && error.code === ERROR_CODES.invitationEmailAlreadyExists) {
        const existingInvitation = await this.invitationRepository.findActiveInvitationByEmailHash(
          input.surveyId,
          protectEmailForLookup(normalizeInvitationEmail(input.recipientEmail))
        );

        return {
          failure: {
            code: ERROR_CODES.invitationEmailAlreadyExists,
            email: normalizeInvitationEmail(input.recipientEmail),
            message: "An active invitation already exists for this email."
          },
          invitation: this.toListItem(existingInvitation!)
        };
      }

      throw error;
    }
  }

  private toListItem(invitation: SurveyInvitation): InvitationListItem {
    return {
      ...invitation,
      recipientEmail: invitation.recipientEmailCiphertext
        ? decryptEmail(invitation.recipientEmailCiphertext)
        : null
    };
  }
}

const formatInvitationDeliveryError = (error: unknown) => {
  if (error instanceof AppError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown provider failure.";
};

const extractInvitationDeliveryErrorMetadata = (error: unknown) => {
  if (error instanceof AppError && error.details && typeof error.details === "object") {
    return error.details as Record<string, unknown>;
  }

  return undefined;
};
